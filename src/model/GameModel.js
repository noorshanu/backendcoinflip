const mongoose = require("mongoose");

const gameSchema = new mongoose.Schema(
  {
    totalPool: { 
      type: String, 
    },
    result: { 
      type: String 
    },
    centers: [{ 
    //   type: mongoose.Schema.Types.ObjectId, 
    //   ref: "Center" 
    type: String,
    }],
    entries: [
      {
        id: {
          type: String,
        },
        centerId: { 
        //   type: mongoose.Schema.Types.ObjectId, 
        //   ref: "Center",
        //   required: true
         type: String,
         required: true
        },
        amount: {
          type: String,
          required: true
        },
        bet: {
          type: String,
          required: true
        },
        result: {
          type: String
        }
      }
    ],
    members: [
      {
        type: String
      }
    ],
    startTime: {
      type: Date
    },

  },
  { timestamps: true }
);

module.exports = mongoose.model("Game", gameSchema);
