use std::{env, fs, io::BufReader};
use rbx_dom_weak::{types::Variant, WeakDom};

fn walk(dom: &WeakDom, r: rbx_dom_weak::types::Ref, depth: usize, errors: &mut Vec<String>, count: &mut usize) {
    let db = rbx_reflection_database::get().unwrap();
    let inst = dom.get_by_ref(r).unwrap();
    *count += 1;
    if db.classes.get(inst.class.as_str()).is_none() {
        errors.push(format!("unknown class {}", inst.class));
    }
    for (name, value) in inst.properties.iter() {
        // find property descriptor through superclass chain
        let mut cls = db.classes.get(inst.class.as_str());
        let mut found = None;
        while let Some(c) = cls {
            if let Some(p) = c.properties.get(name.as_str()) { found = Some(p); break; }
            cls = c.superclass.as_ref().and_then(|s| db.classes.get(AsRef::<str>::as_ref(s)));
        }
        match found {
            None => errors.push(format!("{}.{}: unknown property", inst.class, name)),
            Some(p) => {
                let expected = format!("{:?}", p.data_type);
                let actual = format!("{:?}", value.ty());
                let ok = expected.contains(&actual) || (matches!(value, Variant::Enum(_) | Variant::EnumItem(_)) && expected.contains("Enum"));
                if !ok { errors.push(format!("{}.{}: type {} but expected {}", inst.class, name, actual, expected)); }
            }
        }
    }
    if env::var("RBXCHECK_TREE").is_ok() { println!("{}{} \"{}\" ({} props)", "  ".repeat(depth), inst.class, inst.name, inst.properties.len()); }
    for c in inst.children() { walk(dom, *c, depth + 1, errors, count); }
}

fn main() {
    let path = env::args().nth(1).expect("usage: rbxcheck <file.rbxmx> [out.rbxm]");
    let file = BufReader::new(fs::File::open(&path).expect("open"));
    let opts = rbx_xml::DecodeOptions::new().property_behavior(rbx_xml::DecodePropertyBehavior::ErrorOnUnknown);
    let dom = match rbx_xml::from_reader(file, opts) {
        Ok(d) => d,
        Err(e) => { eprintln!("PARSE ERROR: {}", e); std::process::exit(2); }
    };
    let mut errors = vec![];
    let mut count = 0;
    let roots: Vec<_> = dom.root().children().to_vec();
    for r in &roots { walk(&dom, *r, 0, &mut errors, &mut count); }
    if let Some(out) = env::args().nth(2) {
        let f = fs::File::create(&out).unwrap();
        rbx_binary::to_writer(f, &dom, &roots).expect("binary serialize");
        println!("wrote {}", out);
    }
    println!("{} instances checked", count);
    if !errors.is_empty() { for e in &errors { eprintln!("ERROR {}", e); } std::process::exit(1); }
    println!("OK");
}
