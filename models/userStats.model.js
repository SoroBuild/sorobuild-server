const mongoose = require("mongoose");
const { Schema } = mongoose;

const txSchema = new Schema(
  {
    public: { type: Number, default: 0 },
    testnet: { type: Number, default: 0 },
    local: { type: Number, default: 0 },
    futurenet: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: false }
);

const featureUsedSchema = new Schema(
  {
    ide: { type: Number, default: 0 },
    studio: { type: Number, default: 0 },
  },
  { _id: false }
);

const actionSchema = new Schema(
  {
    deploy: { type: Number, default: 0 },
    invoke: { type: Number, default: 0 },
    read: { type: Number, default: 0 },
    upload: { type: Number, default: 0 },
    asset_ops: { type: Number, default: 0 },
  },
  { _id: false }
);

const userStatSchema = new Schema(
  {
    address: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    credit: {
      type: Number,
      default: 0,
    },
    tx: {
      type: txSchema,
      default: () => ({}),
    },
    feature_used: {
      type: featureUsedSchema,
      default: () => ({}),
    },
    action: {
      type: actionSchema,
      default: () => ({}),
    },
    last_active_at: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

const UserStats = mongoose.model("userStats", userStatSchema);

module.exports = { UserStats };
