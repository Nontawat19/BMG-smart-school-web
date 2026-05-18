const fs = require('fs');
const content = fs.readFileSync('src/pages/AcademicDepartment/StudentSchedulePage.tsx', 'utf8');
let stack = [];
for (let i = 0; i < content.length; i++) {
  if (content[i] === '(') stack.push(i);
  else if (content[i] === ')') {
    if (stack.length === 0) console.log('Extra ) at', i);
    else stack.pop();
  }
}
stack.forEach(pos => {
  const line = content.substring(0, pos).split('\n').length;
  console.log('Unclosed ( at line', line, 'position', pos);
});
