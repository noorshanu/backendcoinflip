const mongoose = require("mongoose");

const centerSchema = new mongoose.Schema(
  {
    name: { 
      type: String, 
      required: true 
    },
    location: { 
      type: String 
    },
    mobile: { 
      type: String,
      required: true
    },
    // Add other fields as needed
  },
  { timestamps: true }
);

module.exports = mongoose.model("Center", centerSchema); 