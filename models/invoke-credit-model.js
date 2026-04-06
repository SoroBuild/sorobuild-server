const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const invokeCreditSchema = new Schema({
  address: String,
  credit: Number,
});

const Credit = mongoose.model("credit", invokeCreditSchema);

module.exports = Credit;
