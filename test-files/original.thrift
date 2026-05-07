/**
 * Test file for annotation edge cases and alignment scenarios
 */

namespace cpp test.annotation

// Test single-element collections with annotations
struct SingleElementCollections {
    1: list<string> singleList = ["one"] (description="Single element list"),
    2: set<i32> singleSet = [42] (description="Single element set"),
    3: map<string,i32> singleMap = {"key":1} (description="Single element map")
}

// Test nested collections with annotations
struct NestedCollections {
    1: list<list<string>> nestedList = [["a", "b"], ["c", "d"]] (description="Nested list"),
    2: map<string,list<i32>> complexMap = {
        "group1": [1, 2, 3],
        "group2": [4, 5, 6]
    } (description="Complex nested structure"),
    3: list<map<string,set<i32>>> deepNested = [
        {"set1": [1, 2], "set2": [3, 4]},
        {"set3": [5, 6], "set4": [7, 8]}
    ] (description="Deep nested structure")
}

// Test multi-line default values with annotations
struct MultiLineDefaults {
    1: list<string> multiList = [
        "line1",
        "line2",
        "line3"
    ] (description="Multi-line list"),
    2: map<string,string> multiMap = {
        "key1": "value1",
        "key2": "value2",
        "key3": "value3"
    } (description="Multi-line map"),
    3: string multiString = "This is a very long string that spans \
        multiple lines and should preserve annotation \
        alignment properly" (description="Multi-line string")
}

// Test annotations with comments before and after
struct CommentAlignment {
    // Comment before field
    1: string field1 (description="Field with before comment"),
    
    2: i32 field2 = 42 (description="Field with annotation and comment") // Comment after field
    
    // Comment between fields
    3: bool field3 = true (description="Another annotated field")
}

// Test complex annotation values
struct ComplexAnnotations {
    1: string field1 (json_name="user_name", max_length=50, pattern="^[a-zA-Z0-9_]+$"),
    2: i32 field2 (range={min:0, max:100}, units="percentage"),
    3: list<string> field3 (validation={required:true, max_items:10}, default=["item1", "item2"])
}

// Test mixed alignment scenarios
struct MixedAlignment {
    1: string short = "a" (desc="Short"),
    2: string veryLongFieldName = "b" (desc="Long field name"),
    3: i32 medium = 123 (desc="Medium field"),
    4: bool flag = true (desc="Boolean flag with longer description")
}

// Test edge cases with trailing commas and different collection styles
struct CollectionStyles {
    1: list<i32> inlineList = [1, 2, 3] (style="inline"),
    2: list<i32> multilineList = [
        1,
        2,
        3
    ] (style="multiline"),
    3: map<string,i32> inlineMap = {"a":1, "b":2} (style="inline"),
    4: map<string,i32> multilineMap = {
        "a": 1,
        "b": 2
    } (style="multiline")
}