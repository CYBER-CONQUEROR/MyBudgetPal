import Income from "./incomeModel.js";

// map mongoose doc → plain object with id
function mapDoc(doc) {
  if (!doc) return null;
  const obj = doc.toObject();
  obj.id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  return obj;
}

export async function getAll(userId) {
  const docs = await Income.find({ userId }).sort({ date: 1, createdAt: 1 });
  return docs.map(mapDoc);
}

export async function add(userId, { date, source, amount }) {
  const doc = await Income.create({ userId, date, source, amount });
  return mapDoc(doc);
}

export async function update(userId, id, patch) {
  const updated = await Income.findOneAndUpdate(
    { _id: id, userId },
    patch,
    { new: true, runValidators: true }
  );
  return updated ? mapDoc(updated) : null;
}

export async function remove(userId, id) {
  const result = await Income.deleteOne({ _id: id, userId });
  return result.deletedCount === 1;
}
