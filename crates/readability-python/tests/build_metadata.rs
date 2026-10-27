// SPDX-License-Identifier: Apache-2.0
#[allow(dead_code)]
#[path = "../build.rs"]
mod metadata;

#[test]
fn prepared_lock_allows_only_unchanged_package_subsets() {
    let one = "version = 4\n[[package]]\nname = \"one\"\nversion = \"1.0\"\n";
    let two = format!("{one}[[package]]\nname = \"two\"\nversion = \"2.0\"\n");
    assert!(metadata::lock_is_covered(one, one));
    assert!(metadata::lock_is_covered(one, &one.replace("\n", "\r\n")));
    assert!(metadata::lock_is_covered(one, &two));
    assert!(!metadata::lock_is_covered(&two, one));
    assert!(!metadata::lock_is_covered(&one.replace("1.0", "1.1"), one));
    assert!(!metadata::lock_is_covered("version = 4", one));
}
