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
// const { BalanceController } = require("../controller/BalanceController");
// const {
//   TransactionController,
// } = require("../controller/TransactionController");

const { generateProof, generateTransferProof, generateUnshieldProof } = require("../controller/proofController");

const GameModel = require("../model/GameModel");
const CenterModel = require("../model/CenterModel");
const UserModel = require("../model/userModel");
const WalletModel = require("../model/WalletModel");

// Public routes
router.post("/user", createUser);
router.post("/generate-shield", generateProof);

router.get("/testing ", (req, res) => {
  res.send("testing");
});

// Protected routes - require authentication
// router.use(protect); // Add authentication middleware to all routes below this line

router.post("/Balance", createBalance);
router.post("/Transaction", createTransaction);
router.get("/users", getAllUsers);
router.get("/transactions", getAllTransactions);
router.get("/balances", getAllBalances);
router.get("/user/:walletAddress", getUserByWalletAddress);
router.get("/balances/:userId", getUserBalances);
router.put('/balances/:balanceId', updateBalance);
router.patch('/balances/:balanceId', updateBalance);

router.get("/hello/", (req, res) => {
  console.log("asdsadasd");
  res.send(`Hello`);
});

router.post("/generate-transfer", generateTransferProof);
router.post("/generate-unshield", generateUnshieldProof);

// temp 

router.post("/generate-game", async (req, res) => {
  const { startTime } = req.body;
  console.log("generate-game with startTime:", startTime);
  
  try {
    // Create game with provided startTime or default
    const game = new GameModel({
      members: [],
      totalPool: "0",
      centers: [],
      entries: [],
      startTime: new Date(startTime)
    });
    
    const savedGame = await game.save();
    console.log("Created game:", savedGame);
    
    res.status(200).json({
      success: true,
      message: "Game created successfully",
      data: savedGame,
    });
  } catch (error) {
    console.error("Error creating game:", error);
    
    // Better error handling for invalid date
    if (error.name === 'CastError' && error.path === 'startTime') {
      return res.status(400).json({
        success: false,
        message: "Invalid startTime format",
        error: "Please provide a valid date format"
      });
    }
    
    res.status(500).json({
      success: false,
      message: "Error creating game",
      error: error.message
    });
  }
});


router.get("/get-all-games", async (req, res) => {
  const games = await GameModel.find();
  res.status(200).json({
    success: true,
    message: "Games fetched successfully",
    data: games,
  });
});


router.get("/get-all-games/:centerId", async (req, res) => {
  try {
    const { centerId } = req.params;
    console.log("Fetching games for centerId:", centerId);

    // Find games where the centerId exists in the centers array
    const games = await GameModel.find({
      centers: centerId
    }).sort({ createdAt: -1 }); // Sort by newest first

    console.log(`Found ${games.length} games for center:`, centerId);

    res.status(200).json({
      success: true,
      message: "Games fetched successfully",
      data: games,
      meta: {
        total: games.length,
        centerId: centerId
      }
    });
  } catch (error) {
    console.error("Error fetching games:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching games",
      error: error.message
    });
  }
});


router.get("/get-all-wallets/:centerId", async (req, res) => {
  const {centerId} = req.params;
  console.log("centerId:", centerId);
  const allWallets = await WalletModel.find();
  console.log("allWallets:", allWallets);
  const wallets = await WalletModel.find({centerId: centerId});
  res.status(200).json({
    success: true,
    message: "Wallets fetched successfully",
    data: wallets,
  });
});



router.get("/get-game/:gameId", async (req, res) => {
  const {gameId} = req.params;
  const game = await GameModel.findById(gameId);
  
  if (!game) {
    return res.status(404).json({
      success: false,
      message: "Game not found"
    });
  }
  
  res.status(200).json({
    success: true,
    message: "Game fetched successfully",
    data: game,
  });
});

router.post("/add-entries", async (req, res) => {
  try {
    const {gameId, entries} = req.body;
    console.log("Received:", gameId, entries);

    if (!gameId || !entries) {
      return res.status(400).json({
        success: false,
        message: "GameId and entries are required"
      });
    }

    // Validate entry format
    const validateEntry = (entry) => {
      return entry.centerId && entry.amount && entry.bet;
    };

    // Check if entries are valid
    if (Array.isArray(entries)) {
      if (!entries.every(validateEntry)) {
        return res.status(400).json({
          success: false,
          message: "Invalid entry format"
        });
      }
    } else if (!validateEntry(entries)) {
      return res.status(400).json({
        success: false,
        message: "Invalid entry format"
      });
    }

    const game = await GameModel.findById(gameId);
    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found"
      });
    }

    // Calculate total amount of entries
    const totalAmount = Array.isArray(entries) 
      ? entries.reduce((acc, entry) => acc + parseFloat(entry.amount), 0)
      : parseFloat(entries.amount);

    // Deduct total amount from the user's points
    const centerId = Array.isArray(entries) ? entries[0].centerId : entries.centerId;
    const user = await UserModel.findById(centerId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }
    user.points -= totalAmount;
    await user.save();

    // Get all centerIds from new entries
    const newCenterIds = Array.isArray(entries) 
      ? [...new Set(entries.map(entry => entry.centerId))]
      : [entries.centerId];

    // Add new centerIds to game.centers if they don't exist
    newCenterIds.forEach(centerId => {
      if (!game.centers.includes(centerId)) {
        game.centers.push(centerId);
      }
    });

    // Add entries and update totalPool
    if (Array.isArray(entries)) {
      game.entries.push(...entries);
      game.totalPool = (parseFloat(game.totalPool || "0") + entries.reduce((acc, entry) => acc + parseFloat(entry.amount), 0)).toString();
    } else {
      game.entries.push(entries);
      game.totalPool = (parseFloat(game.totalPool || "0") + parseFloat(entries.amount)).toString();
    }

    // Determine the minority bet and update the game result
    const totalHeadsAmount = game.entries.filter(entry => entry.bet === 'heads').reduce((acc, entry) => acc + parseFloat(entry.amount), 0);
    const totalTailsAmount = game.entries.filter(entry => entry.bet === 'tails').reduce((acc, entry) => acc + parseFloat(entry.amount), 0);
    const newHeadsAmount = entries.filter(entry => entry.bet === 'heads').reduce((acc, entry) => acc + parseFloat(entry.amount), 0);
    const newTailsAmount = entries.filter(entry => entry.bet === 'tails').reduce((acc, entry) => acc + parseFloat(entry.amount), 0);
    const updatedTotalHeadsAmount = totalHeadsAmount + newHeadsAmount;
    const updatedTotalTailsAmount = totalTailsAmount + newTailsAmount;
    if (updatedTotalHeadsAmount < updatedTotalTailsAmount) {
      game.result = 'heads';
    } else if (updatedTotalTailsAmount < updatedTotalHeadsAmount) {
      game.result = 'tails';
    } else {
      // In case of a tie, randomly select between heads and tails
      game.result = Math.random() > 0.5 ? 'heads' : 'tails';
      console.log('Tie detected, randomly selected result:', game.result);
    }

    const savedGame = await game.save();
    console.log("Saved game:", savedGame);
    
    res.status(200).json({
      success: true,
      message: "Entries added successfully",
      data: savedGame,
    });
  } catch (error) {
    console.error("Error in add-entries:", error);
    res.status(500).json({
      success: false,
      message: "Error adding entries",
      error: error.message
    });
  }
});

router.post("/add-points", async (req, res) => {
  const {centerId, points} = req.body;
  // console.log("centerId:", centerId);
  console.log("points:", points);
  const user = await UserModel.findById(centerId);
  user.points += points;
  await user.save();

  const wallet = new WalletModel({
    centerId: centerId,
    pointsTransferred: points,
    transactionType: "CREDIT",
  });
  await wallet.save();

  res.status(200).json({
    success: true,
    message: "Points added successfully",
    data: user,
  });
});


router.get("/get-points/:centerId", async (req, res) => {
  const {centerId} = req.params;
  const user = await UserModel.findById(centerId);
  
  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found"
    });
  }
  
  res.status(200).json({
    success: true,
    message: "Points fetched successfully",
    data: user.points,
  });
});

router.post("/create-center", async (req, res) => {
  const {name, location, mobile} = req.body;
  const center = new CenterModel({
    name,
    location,
    mobile,
  });
  await center.save();
  res.status(200).json({
    success: true,
    message: "Center created successfully",
    data: center,
  });
});

router.get("/get-all-centers", async (req, res) => {
  const centers = await UserModel.find();
  res.status(200).json({
    success: true,
    message: "Centers fetched successfully",
    data: centers,
  });
});

router.get("/get-center/:centerId", async (req, res) => {
  const {centerId} = req.params;
  const center = await UserModel.findById(centerId);
  
  if (!center) {
    return res.status(404).json({
      success: false,
      message: "Center not found"
    });
  }
  
  res.status(200).json({
    success: true,
    message: "Center fetched successfully",
    data: center,
  });
});

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