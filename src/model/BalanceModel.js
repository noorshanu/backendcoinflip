const mongoose = require("mongoose");

const balanceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    commitment: { type: String },
    amount: { type: String },
    tokenAddress: { type: String },
    blinding: { type: String },
    show: { type: Boolean, default: true },
    transfersDone: { type: Number, default: 0 },
    unshielded: { type: Boolean, default: false },
    shieldProofData: { 
      type: Object, 
      default: {
        tokenAddress: String,
        amount: String,
        commitment: String,
        pA: [String, String],
        pB: [[String, String], [String, String]],
        pC: [String, String],
        blinding: String,
      }
    },
    transferProofData: {
      oldCommitment: String,
      inputAmount: String,
      transferAmount: Number,
      tokenAddress: String,
      privateAddress: String,
      oldBlinding: String,
      recipientAddress: String,
      newBlinding: String,
      changeBlinding: String,
      calculatedCommitment: String,
      newCommitment: String,
      changeCommitment: String,
      remainingAmount: String,
      pA: [[String, String]],
      pB: [[[String, String], [String, String]]],
      pC: [String, String]
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Balance", balanceSchema);
