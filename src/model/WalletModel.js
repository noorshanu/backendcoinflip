const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema(
  {
    centerId: {
      type: String,
      required: true,
      ref: "User" // Reference to User model since centers are stored in User model
    },
    pointsTransferred: {
      type: Number,
      required: true
    },
    transactionTime: {
      type: Date,
      default: Date.now
    },
    transactionType: {
      type: String,
      enum: ['CREDIT', 'DEBIT'],
      required: true
    }
  },
  { 
    timestamps: true // This will automatically add createdAt and updatedAt fields
  }
);

// Add an index for faster queries
walletSchema.index({ centerId: 1, transactionTime: -1 });

module.exports = mongoose.model("Wallet", walletSchema);
