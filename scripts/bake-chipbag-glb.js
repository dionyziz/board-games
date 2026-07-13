// Bake our relabelled atlas into the chip-bag GLB as its base-colour image, and
// repack the binary buffer compactly. The result (public/models/bag-of-chips.glb)
// ships only the textures we use — our label (base colour) + the model's normal &
// roughness maps — with no leftover Calbee base texture.
//   node scripts/gen-chipbag-atlas.js && node scripts/bake-chipbag-glb.js
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'model-src', 'calbee_potato_chips_pizza.glb');
const ATLAS = path.join(__dirname, 'cyl-src', 'bag-of-chips-atlas.png');
const OUT = path.join(__dirname, '..', 'public/models/bag-of-chips.glb');
const align4 = (n) => (n + 3) & ~3;

const buf = fs.readFileSync(SRC);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
const binData = buf.slice(12 + 8 + jsonLen + 8); // BIN chunk payload
const atlas = fs.readFileSync(ATLAS);
const baseBV = json.images[0].bufferView; // image 0 = base colour

// rebuild the buffer: copy each bufferView's bytes in index order (substituting
// the base-colour image with our atlas), reassigning 4-byte-aligned offsets
const parts = []; let offset = 0;
for (let i = 0; i < json.bufferViews.length; i++) {
  const bv = json.bufferViews[i];
  const data = i === baseBV ? atlas : binData.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
  bv.byteOffset = offset; bv.byteLength = data.length; // byteStride (if any) is preserved
  parts.push(data); offset += data.length;
  const pad = align4(offset) - offset; if (pad) { parts.push(Buffer.alloc(pad)); offset += pad; }
}
const bin = Buffer.concat(parts);
json.buffers[0].byteLength = bin.length;

let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
const jpad = align4(jsonBuf.length) - jsonBuf.length; if (jpad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jpad, 0x20)]);
const total = 12 + 8 + jsonBuf.length + 8 + bin.length;
const out = Buffer.alloc(total);
out.write('glTF', 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(total, 8);
out.writeUInt32LE(jsonBuf.length, 12); out.writeUInt32LE(0x4e4f534a, 16); jsonBuf.copy(out, 20);
const c1 = 20 + jsonBuf.length;
out.writeUInt32LE(bin.length, c1); out.writeUInt32LE(0x004e4942, c1 + 4); bin.copy(out, c1 + 8);
fs.writeFileSync(OUT, out);
console.log(`baked ${OUT} — ${(total / 1e6).toFixed(2)}MB (was ${(buf.length / 1e6).toFixed(2)}MB)`);
