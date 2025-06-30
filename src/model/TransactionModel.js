const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["SHIELD", "TRANSFER", "UNSHIELD"] },
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    toUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // optional for transfers
    commitment: { type: String },
    nullifier: { type: String }, // optional
    amount: { type: String },
    tokenAddress: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Transaction", transactionSchema);
