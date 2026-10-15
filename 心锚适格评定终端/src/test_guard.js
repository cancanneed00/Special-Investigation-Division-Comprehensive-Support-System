const assert=require('assert'),g=require('./input_guard');
for(const op of ['dismantle','click','key','unlock','解离'])assert.throws(()=>g.validate({op,guard:[{}]}));
assert.throws(()=>g.validate({op:'mark',kind:'dismantle',guard:[{}]}));
assert.throws(()=>g.validate({op:'mark',kind:'lock'}));
for(const y of [139,601,670,NaN])assert.throws(()=>g.point({op:'select',col:4,y,guard:[{}]}));
for(let col=0;col<5;col++)for(let y=140;y<=600;y++){const p=g.point({op:'select',col,y,guard:[{}]});assert(p[1]<640);}
assert.throws(()=>g.validate({op:'scroll',direction:'arbitrary',guard:[{}]}));
assert.deepEqual(g.point({op:'mark',kind:'lock',guard:[{}]}),[73,144]);
assert.deepEqual(g.point({op:'mark',kind:'discard',guard:[{}]}),[50,203]);
assert.deepEqual(g.point({op:'sort_level',guard:[{}]}),[650,52]);
assert.throws(()=>g.validate({op:'sort_level'}));
console.log('Input whitelist passed (2305 grid destinations; forbidden operations rejected).');
