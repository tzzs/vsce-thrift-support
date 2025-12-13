
console.log("Start");
const fs = require('fs');
try {
    fs.writeFileSync('debug.txt', 'test');
    console.log("Written");
} catch (e) {
    console.error(e);
}
console.log("End");
