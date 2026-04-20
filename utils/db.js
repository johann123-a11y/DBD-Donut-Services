const mongoose = require('mongoose');

let connected = false;

async function connectDB() {
  if (connected) return;
  await mongoose.connect(process.env.MONGO_URI);
  connected = true;
  console.log('✅ MongoDB connected');
}

// ── Schemas ──────────────────────────────────────────────────────────────────

const shopSchema = new mongoose.Schema({
  _id:       String,
  title:     String,
  price:     String,
  stock:     Number,
  imageUrl:  String,
  createdBy: String,
  messageId: String,
  channelId: String,
});

const cartItemSchema = new mongoose.Schema({
  shopItemId: String,
  title:      String,
  price:      String,
  quantity:   Number,
}, { _id: false });

const cartSchema = new mongoose.Schema({
  _id:            String,   // userId
  orderId:        String,
  items:          [cartItemSchema],
  orderMessageId: String,
  orderChannelId: String,
  status:         { type: String, default: 'waiting' },
});

const configSchema = new mongoose.Schema({
  _id:             { type: String, default: 'global' },
  pingUsers:        { type: [String], default: [] },
  pingRoles:        { type: [String], default: [] },
  ticketCategoryId: { type: String, default: null },
});

// ── Models ───────────────────────────────────────────────────────────────────

const Shop   = mongoose.models.Shop   || mongoose.model('Shop',   shopSchema);
const Cart   = mongoose.models.Cart   || mongoose.model('Cart',   cartSchema);
const Config = mongoose.models.Config || mongoose.model('Config', configSchema);

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getShop(id)         { return Shop.findById(id).lean(); }
async function saveShop(id, data)  { return Shop.findByIdAndUpdate(id, { _id: id, ...data }, { upsert: true, new: true }); }
async function deleteShop(id)          { return Shop.findByIdAndDelete(id); }
async function findShopByName(name)    { return Shop.findOne({ title: { $regex: new RegExp(`^${name}$`, 'i') } }).lean(); }
async function getAllShops()            { return Shop.find().lean(); }

async function getCart(userId)        { return Cart.findById(userId).lean(); }
async function saveCart(userId, data) { return Cart.findByIdAndUpdate(userId, { _id: userId, ...data }, { upsert: true, new: true, overwrite: true }); }

async function getConfig() {
  let cfg = await Config.findById('global').lean();
  if (!cfg) cfg = await Config.create({ _id: 'global' });
  return cfg;
}
async function saveConfig(data) { return Config.findByIdAndUpdate('global', { $set: data }, { upsert: true, new: true }); }

module.exports = { connectDB, getShop, saveShop, deleteShop, findShopByName, getAllShops, getCart, saveCart, getConfig, saveConfig };
