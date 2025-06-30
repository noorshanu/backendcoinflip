const express = require("express");
const router = express.Router();
// const { protect } = require('../middleware/auth');
const {
  createBalance,
  createUser,
  createTransaction,
  getAllBalances,
  getAllTransactions,
  getAllUsers,
  getUserByWalletAddress,
  getUserBalances,
  updateBalance,
} = require("../controller/userController");

const { generateProof, generateTransferProof, generateUnshieldProof } = require("../controller/proofController");

const GameModel = require("../model/GameModel");
const CenterModel = require("../model/CenterModel");
const UserModel = require("../model/userModel");
const WalletModel = require("../model/WalletModel");

router.post("/set-result/:gameId", async (req, res) => {
  try {
    const { gameId } = req.params;
    const { result } = req.body;
    
    console.log(`Setting result for game ${gameId}:`, result);
    
    const game = await GameModel.findById(gameId);
    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found"
      });
    }

    game.result = result;
    const savedGame = await game.save();
    console.log("Updated game:", savedGame);
    
    res.status(200).json({
      success: true,
      message: "Result set successfully",
      data: savedGame
    });
  } catch (error) {
    console.error("Error setting game result:", error);
    res.status(500).json({
      success: false,
      message: "Error setting game result",
      error: error.message
    });
  }
});

module.exports = router; 