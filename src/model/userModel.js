const mongoose = require("mongoose");
const bcrypt = require("mongoose-bcrypt"); // You'll need to install this package

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },
    phone: { 
      type: String,
      required: true,
      unique: true
    },
    password: { 
      type: String,
      required: true,
      bcrypt: true // This will automatically hash the password
    },
    isActive: {
      type: Boolean,
      default: true
    },
    points: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

// Add bcrypt plugin
userSchema.plugin(bcrypt);

module.exports = mongoose.model("User", userSchema);
