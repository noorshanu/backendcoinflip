const { ethers } = require("ethers");
// const { Web3 } = require('web3'); // Note the destructuring
// Use Sepolia testnet RPC URL
const provider = new ethers.providers.JsonRpcProvider(
  "https://ethereum-sepolia-rpc.publicnode.com", // Use a direct RPC URL instead
  {
    chainId: 11155111,
    name: 'sepolia'
  }
);
// Or use Infura/Alchemy with your API key
// const web3 = new Web3(`https://sepolia.infura.io/v3/${YOUR_INFURA_KEY}`);
const contractAddress = '0x3D86B80898b223C0F26166670AA8638af263cBA2';
const contractABI = require('./shield-abi.json');
// Change this line - replace require with dynamic import
// const { initialize } = require("zokrates-js");
const fs = require("fs");
const path = require("path");
const BalanceModel = require("../model/BalanceModel");
const userModel = require("../model/userModel");

// Add connection check
const checkConnection = async () => {
  try {
    await provider.getNetwork();
    console.log("Successfully connected to Sepolia network");
  } catch (error) {
    console.error("Provider connection error:", error);
    throw new Error("Failed to connect to Sepolia network");
  }
};

/**
 * Route handler for generating proof
 * Handles POST requests to /generate-proof endpoint
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.generateProof = async (req, res) => {
  try {
    const { tokenAddress, privateAddress, amount } = req.body;
    
    // Validate required parameters
    if (!tokenAddress || !privateAddress || !amount) {
      return res.status(400).json({
        success: false,
        message: "Missing required parameters: tokenAddress, privateAddress, and amount are required"
      });
    }
    
    // Validate token address format
    if (!tokenAddress.startsWith("0x") || tokenAddress.length !== 42) {
      return res.status(400).json({
        success: false,
        message: "Invalid token address format. Must be a valid Ethereum address"
      });
    }
    
    // Generate shield parameters
    const parameters = await exports.generateShieldParameters(
      tokenAddress,
      privateAddress,
      amount
    );
    
    // Return successful response
    return res.status(200).json({
      success: true,
      data: parameters
    });
    
  } catch (error) {
    console.error("Error in generateProof route:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate proof",
      error: error.message
    });
  }
};

/**
 * Generates shield proof with the given parameters
 *     
 * @param tokenAddress The token address in hex format
 * @param privateAddress The private address in hex format
 * @param amount The amount to shield
 * @returns The formatted parameters needed for calling the shield function
 */
exports.generateShieldParameters = async (
  tokenAddress, 
  privateAddress,    
  amount
) => {
  console.log("\n===== GENERATING SHIELD PARAMETERS =====");
  
  // Convert token address to decimal
  const tokenDecimal = convertAddressToDecimal(tokenAddress);
  
  // Generate random blinding factor
  const blinding = generateRandomField();
  
  // For logging purposes
  console.log("🔹 Token Address (Hex):", tokenAddress);
  console.log("🔹 Token Address (Decimal):", tokenDecimal);
  console.log("🔹 Amount:", amount);
  console.log("🔹 Private Address:", privateAddress);
  console.log("🔹 Blinding Factor (Random):", blinding);
  
  try {
    // Use dynamic import for zokrates-js instead of require
    console.log("\n🔹 Initializing ZoKrates...");
    const zokratesModule = await import('zokrates-js');
    const zokratesProvider = await zokratesModule.initialize();
    
    // Read the shield circuit source - adjust path as needed for your project
    console.log("🔹 Reading circuit from shield.zok...");
    const sourcePath = path.resolve(__dirname, "../circuits/shield.zok");
    const source = fs.readFileSync(sourcePath, "utf8");
    
    // Compile the program
    console.log("🔹 Compiling ZoKrates program...");
    const artifacts = zokratesProvider.compile(source);
    
    // Compute witness
    console.log("🔹 Computing witness...");
    const { witness, output } = zokratesProvider.computeWitness(artifacts, [
      amount,
      tokenDecimal,
      privateAddress,
      blinding
    ]);
    
    // Get the commitment hash from the output
    let commitment = output;
    if (typeof commitment === "string") {
      commitment = commitment.replace(/"/g, "");
    }
    
    // Format commitment as hex
    const commitmentHex = "0x" + BigInt(commitment).toString(16).padStart(64, "0");
    console.log("🔹 Generated commitment:", commitmentHex);
    
    // Setup or load proving/verification keys
    let provingKey, verificationKey;
    const keyDirectory = path.resolve(__dirname, "../keys");
    const provingKeyPath = path.resolve(keyDirectory, "shield-proving.key");
    const verificationKeyPath = path.resolve(keyDirectory, "shield-verification.key");
    
    // Create key directory if it doesn't exist
    if (!fs.existsSync(keyDirectory)) {
      fs.mkdirSync(keyDirectory, { recursive: true });
    }
    
    // if (fs.existsSync(provingKeyPath) && fs.existsSync(verificationKeyPath)) {
      console.log("🔹 Loading existing proving and verification keys...");
      provingKey = fs.readFileSync(provingKeyPath);
      verificationKey = JSON.parse(fs.readFileSync(verificationKeyPath, "utf8"));
    // } else {
    //   console.log("🔹 Generating new proving and verification keys...");
    //   const keys = zokratesProvider.setup(artifacts.program);
    //   provingKey = keys.provingKey;
    //   verificationKey = keys.verificationKey;
      
    //   // Save keys for future use
    //   fs.writeFileSync(provingKeyPath, Buffer.from(provingKey));
    //   fs.writeFileSync(verificationKeyPath, JSON.stringify(verificationKey, null, 2));
    // }
    
    // Generate the proof
    console.log("🔹 Generating zero-knowledge proof...");
    const proof = zokratesProvider.generateProof(artifacts.program, witness, provingKey);
    
    // Verify the proof locally
    console.log("🔹 Verifying proof locally...");
    const isValid = zokratesProvider.verify(verificationKey, proof);
    
    if (isValid) {
      console.log("✅ Proof is valid!");
    } else {
      throw new Error("❌ Proof verification failed!");
    }
    
    // Format proof for Solidity
    const formattedProof = {
      pA: proof.proof.a,
      pB: proof.proof.b,
      pC: proof.proof.c
    };
    
    // Return the formatted parameters
    const parameters = {
      tokenAddress,
      amount,
      commitment: commitmentHex,
      pA: formattedProof.pA,
      pB: formattedProof.pB,
      pC: formattedProof.pC,
      blinding  // Keep blinding for future operations
    };
    
    console.log("\n===== SHIELD PARAMETERS =====");
    console.log("token (address):", parameters.tokenAddress);
    console.log("amount (uint256):", parameters.amount);
    console.log("commitment (bytes32):", parameters.commitment);
    console.log("_pA (uint[2]):", JSON.stringify(parameters.pA));
    console.log("_pB (uint[2][2]):", JSON.stringify(parameters.pB));
    console.log("_pC (uint[2]):", JSON.stringify(parameters.pC));
    
    return parameters;
    
  } catch (error) {
    console.error("Error during shield parameter generation:", error);
    throw error;
  }
}

/**
 * Convert Ethereum address from hex to decimal
 */
function convertAddressToDecimal(address) {
  const cleanAddress = address.startsWith('0x') ? address.slice(2) : address;
  return BigInt('0x' + cleanAddress).toString();
}

/**
 * Generate a random field element (for blinding factor)
 */
function generateRandomField() {
  // Generate a random 60-character hex string (slightly shorter to avoid overflow)
  return "0x" + [...Array(60)].map(() => Math.floor(Math.random() * 16).toString(16)).join("");
}

/**
 * Generates transfer parameters with the given inputs
 * 
 * @param oldCommitment The existing commitment hash
 * @param inputAmount The total input amount
 * @param transferAmount The amount to transfer
 * @param tokenAddress The token address in hex format
 * @param privateAddress The sender's private address
 * @param oldBlinding The original blinding factor
 * @param recipientAddress The recipient's address
 * @param newBlinding Optional blinding factor for new commitment (generated if not provided)
 * @param changeBlinding Optional blinding factor for change commitment (generated if not provided)
 * @returns The formatted parameters needed for calling the transfer function
 */
exports.generateTransferParameters = async (
  oldCommitment,
  inputAmount,
  transferAmount,
  tokenAddress,
  privateAddress,
  oldBlinding,
  recipientAddress,
  newBlinding = null,
  changeBlinding = null
) => {
  console.log("\n===== GENERATING TRANSFER PARAMETERS =====");
  console.log("inputAmount", inputAmount);
  
  // Generate random blinding factors if not provided
  newBlinding = newBlinding || generateRandomField();
  changeBlinding = changeBlinding || generateRandomField();
  
  // Convert to string values - ZoKrates expects all numbers as strings
  // We'll handle any conversion from hex to decimal as needed
  const inputAmountStr = String(inputAmount);
  console.log("inputAmountStr", inputAmountStr);
  const transferAmountStr = String(transferAmount);
  
  // Convert addresses to decimal
  // const tokenDecimal = convertAddressToDecimal(tokenAddress);
  // const recipientDecimal = convertAddressToDecimal(recipientAddress);
  
  // Ensure privateAddress and oldBlinding are strings
  const privateAddressStr = String(privateAddress);
  const oldBlindingStr = String(oldBlinding);
  
  // For logging purposes
  console.log("🔹 Old Commitment:", oldCommitment);
  console.log("🔹 Token Address:", tokenAddress);
  // console.log("🔹 Token Address (Decimal):", tokenDecimal);
  console.log("🔹 Input Amount:", inputAmountStr);
  console.log("🔹 Transfer Amount:", transferAmountStr);
  console.log("🔹 Sender Private Address:", privateAddressStr);
  console.log("🔹 Recipient Address:", recipientAddress);
  // console.log("🔹 Recipient Address (Decimal):", recipientDecimal);
  console.log("🔹 New Blinding Factor:", newBlinding);
  console.log("🔹 Change Blinding Factor:", changeBlinding);
  
  try {
    // Validate transfer amount
    const inputAmountBN = BigInt(inputAmount);
    const transferAmountBN = BigInt(transferAmount);
    
    if (transferAmountBN <= 0n) {
      throw new Error("Transfer amount must be greater than 0");
    }
    
    if (transferAmountBN > inputAmountBN) {
      throw new Error("Transfer amount cannot exceed input amount");
    }
    
    // Initialize ZoKrates
    console.log("\n🔹 Initializing ZoKrates...");
    const zokratesModule = await import('zokrates-js');
    const zokratesProvider = await zokratesModule.initialize();
    
    // Read the transfer circuit source
    console.log("🔹 Reading circuit from transfer.zok...");
    const sourcePath = path.resolve(__dirname, "../circuits/transfer.zok");
    const source = fs.readFileSync(sourcePath, "utf8");
    
    // Compile the program
    console.log("🔹 Compiling ZoKrates program...");
    const artifacts = zokratesProvider.compile(source);
    
    // Remove 0x prefix from oldCommitment if it exists
    const oldCommitmentValue = String(oldCommitment).startsWith('0x') 
      ? oldCommitment.slice(2) 
      : oldCommitment;
    
    // Convert commitment to decimal if it's in hex format
    const oldCommitmentDecimal = String(BigInt('0x' + oldCommitmentValue));
    
    // Ensure all values are strings for ZoKrates
    const zokratesInputs = [
      oldCommitment,    // Make sure it's a string
      inputAmountStr,          // Already converted to string
      transferAmountStr,       // Already converted to string
      tokenAddress,            // Already a string from convertAddressToDecimal
      // "0xa66f18610c8f796e53d2b17ac0756b79d6771ce43cad2ee3c515e4f00869",
      privateAddressStr,       // Make sure it's a string
      oldBlindingStr,          // Make sure it's a string
      recipientAddress,        // Already a string from convertAddressToDecimal
      String(newBlinding),     // Make sure it's a string
      String(changeBlinding)   // Make sure it's a string
    ];
    
    // Compute witness
    console.log("🔹 Computing witness...");
    console.log("Inputs:", zokratesInputs);
    
    const { witness, output } = zokratesProvider.computeWitness(artifacts, zokratesInputs);
    
    console.log("🔹 Output:", output);
    
    // Parse the output - handle both string and array formats
    let calculatedCommitment, newCommitment, changeCommitment;
    
    // Check if output is an array or a single value
    if (Array.isArray(output)) {
      // If it's an array, extract the values
      [calculatedCommitment, newCommitment, changeCommitment] = output;
    } else {
      // If it's a single value, it might be a JSON string representation of an array
      try {
        if (typeof output === 'string' && output.startsWith('[') && output.endsWith(']')) {
          const parsedOutput = JSON.parse(output);
          [calculatedCommitment, newCommitment, changeCommitment] = parsedOutput;
        } else {
          throw new Error("Unexpected output format from ZoKrates");
        }
      } catch (error) {
        console.error("Error parsing ZoKrates output:", error);
        throw new Error("Failed to parse ZoKrates output");
      }
    }
    
    // Clean up the string values if needed
    if (typeof calculatedCommitment === "string") calculatedCommitment = calculatedCommitment.replace(/"/g, "");
    if (typeof newCommitment === "string") newCommitment = newCommitment.replace(/"/g, "");
    if (typeof changeCommitment === "string") changeCommitment = changeCommitment.replace(/"/g, "");
    
    console.log("🔹 Calculated Commitment:", calculatedCommitment);
    console.log("🔹 New Commitment (for recipient):", newCommitment);
    console.log("🔹 Change Commitment (for sender):", changeCommitment);
    
    // Convert commitments to hex format
    const calculatedCommitmentHex = "0x" + BigInt(calculatedCommitment).toString(16).padStart(64, "0");
    const newCommitmentHex = "0x" + BigInt(newCommitment).toString(16).padStart(64, "0");
    const changeCommitmentHex = "0x" + BigInt(changeCommitment).toString(16).padStart(64, "0");
    
    console.log("🔹 Calculated Commitment (hex):", calculatedCommitmentHex);
    console.log("🔹 New Commitment (hex):", newCommitmentHex);
    console.log("🔹 Change Commitment (hex):", changeCommitmentHex);
    
    // Setup or load proving/verification keys
    let provingKey, verificationKey;
    const keyDirectory = path.resolve(__dirname, "../keys");
    const provingKeyPath = path.resolve(keyDirectory, "transfer-proving.key");
    const verificationKeyPath = path.resolve(keyDirectory, "transfer-verification.key");
    
    // Create key directory if it doesn't exist
    if (!fs.existsSync(keyDirectory)) {
      fs.mkdirSync(keyDirectory, { recursive: true });
    }
    
    if (fs.existsSync(provingKeyPath) && fs.existsSync(verificationKeyPath)) {
      console.log("🔹 Loading existing proving and verification keys...");
      provingKey = fs.readFileSync(provingKeyPath);
      verificationKey = JSON.parse(fs.readFileSync(verificationKeyPath, "utf8"));
    } else {
      console.log("🔹 Generating new proving and verification keys...");
      const keys = zokratesProvider.setup(artifacts.program);
      provingKey = keys.provingKey;
      verificationKey = keys.verificationKey;
      
      // Save keys for future use
      fs.writeFileSync(provingKeyPath, Buffer.from(provingKey));
      fs.writeFileSync(verificationKeyPath, JSON.stringify(verificationKey, null, 2));
    }
    
    // Generate the proof
    console.log("🔹 Generating zero-knowledge proof...");
    const proof = zokratesProvider.generateProof(artifacts.program, witness, provingKey);
    
    // Verify the proof locally
    console.log("🔹 Verifying proof locally...");
    const isValid = zokratesProvider.verify(verificationKey, proof);
    
    if (isValid) {
      console.log("✅ Proof is valid!");
    } else {
      throw new Error("❌ Proof verification failed!");
    }
    
    // Format proof for Solidity
    const formattedProof = {
      pA: proof.proof.a,
      pB: proof.proof.b,
      pC: proof.proof.c
    };
    
    // Calculate remaining amount
    const remainingAmount = (BigInt(inputAmount) - BigInt(transferAmount)).toString();
    
    // Return the formatted parameters
    const parameters = {
      oldCommitment: oldCommitment,
      inputAmount: inputAmount,
      transferAmount: transferAmount,
      tokenAddress: tokenAddress,
      // tokenDecimal: tokenDecimal,
      privateAddress: privateAddress,
      oldBlinding: oldBlinding,
      recipientAddress: recipientAddress,
      // recipientDecimal: recipientDecimal,
      newBlinding: newBlinding,
      changeBlinding: changeBlinding,
      calculatedCommitment: calculatedCommitmentHex,
      newCommitment: newCommitmentHex,
      changeCommitment: changeCommitmentHex,
      remainingAmount: remainingAmount,
      pA: formattedProof.pA,
      pB: formattedProof.pB,
      pC: formattedProof.pC
    };
    
    console.log("\n===== TRANSFER PARAMETERS =====");
    console.log("calculatedCommitment (bytes32):", parameters.calculatedCommitment);
    console.log("newCommitment (bytes32):", parameters.newCommitment);
    console.log("changeCommitment (bytes32):", parameters.changeCommitment);
    console.log("_pA (uint[2]):", JSON.stringify(parameters.pA));
    console.log("_pB (uint[2][2]):", JSON.stringify(parameters.pB));
    console.log("_pC (uint[2]):", JSON.stringify(parameters.pC));
    
    return parameters;
    
  } catch (error) {
    console.error("Error during transfer parameter generation:", error);
    throw error;
  }
};

/**
 * Route handler for generating transfer proof
 * Handles POST requests to /generate-transfer endpoint
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.generateTransferProof = async (req, res) => {
  try {
    // const { 
    //   oldCommitment, 
    //   inputAmount, 
    //   transferAmount, 
    //   tokenAddress, 
    //   privateAddress, 
    //   oldBlinding, 
    //   recipientAddress 
    // } = req.body;

    const {balanceId, recipientAddress, transferAmount} = req.body;
    console.log("transferAmount", transferAmount);

    console.log("balanceId", balanceId.balance_id);
    const balance = await BalanceModel.findById(balanceId.balance_id);

    // const {oldCommitment, inputAmount, transferAmount, tokenAddress, privateAddress, oldBlinding, recipientAddress} = balance.proofData;
    
    const oldCommitment = convertAddressToDecimal(balance.commitment);
    const inputAmount = balance.amount;
    const tokenAddress = convertAddressToDecimal(balance.tokenAddress);

    const userAssociatedWithBalance = await userModel.findById(balance.userId);
    console.log("userAssociatedWithBalance", userAssociatedWithBalance);
    const privateAddress = userAssociatedWithBalance.privateAddress;
    const oldBlinding = balance.blinding;

    console.log("oldCommitment", oldCommitment);
    console.log("inputAmount", inputAmount);
    console.log("tokenAddress", tokenAddress);
    console.log("privateAddress", privateAddress);
    console.log("oldBlinding", oldBlinding);
    console.log("recipientAddress", recipientAddress);

    // Validate required parameters
    // if (!oldCommitment || !inputAmount || !transferAmount || !tokenAddress || 
    //     !privateAddress || !oldBlinding || !recipientAddress) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Missing required parameters for transfer proof generation"
    //   });
    // }
    
    // // Validate token and recipient address format
    // if (!tokenAddress.startsWith("0x") || tokenAddress.length !== 42) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Invalid token address format. Must be a valid Ethereum address"
    //   });
    // }
    
    // if (!recipientAddress.startsWith("0x") || recipientAddress.length !== 42) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Invalid recipient address format. Must be a valid Ethereum address"
    //   });
    // }

    const changeCoimmitment = balance.transferProofData.changeCommitment;
    console.log("changeCoimmitment", changeCoimmitment);
    console.log("working till here")
    // Generate transfer parameters
    let parameters;

    if(balance.transfersDone === 0) {
     parameters = await exports.generateTransferParameters(
      oldCommitment,
      // changeCoimmitment,
      inputAmount,
      transferAmount,
      tokenAddress,
      privateAddress,
      oldBlinding,
      convertAddressToDecimal(recipientAddress)
    )} else {
      parameters = await exports.generateTransferParameters(
        balance.transferProofData.changeCommitment,
        // changeCoimmitment,
        inputAmount,
        transferAmount,
        tokenAddress,
        privateAddress,
        balance.transferProofData.changeBlinding,
        convertAddressToDecimal(recipientAddress)
      );
    }

    // Interact with the smart contract
    try {
      console.log("\n===== STARTING CONTRACT INTERACTION =====");
      
      // Check provider connection first
      await checkConnection();
      
      // Create wallet instance from private key
      const privateKey = '00981b6308651206464fafe3648945531c42bee916e0b03def2b92fcd0acfda0';
      const wallet = new ethers.Wallet(privateKey, provider);
      
      // Log wallet address and balance
      console.log("Wallet address:", wallet.address);
      const walletBalance = await wallet.getBalance();
      console.log("Wallet balance:", ethers.utils.formatEther(walletBalance), "ETH");

      // Create contract instance
      const contract = new ethers.Contract(contractAddress, contractABI, wallet);
      console.log("Contract address:", contractAddress);

      // Verify contract exists
      const code = await provider.getCode(contractAddress);
      if (code === '0x') {
        throw new Error('Contract not deployed at specified address');
      }

      // Convert proof parameters to correct format
      const proofData = {
        a: parameters.pA,
        b: parameters.pB,
        c: parameters.pC
      };

      console.log("\nProof data:", proofData);
      console.log("\nCommitments:", {
        calculatedCommitment: parameters.calculatedCommitment,
        newCommitment: parameters.newCommitment,
        changeCommitment: parameters.changeCommitment
      });

      // Get current gas price and nonce
      const feeData = await provider.getFeeData();
      // Get nonce using provider instead of wallet
      const nonce = await provider.getTransactionCount(wallet.address);

      // Prepare transaction options
      const txOptions = {
        nonce: nonce,
        gasLimit: 3000000, // No need to convert to hex in v5
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
      };

      console.log("\nTransaction options:", txOptions);

      try {
        // Estimate gas first
        const gasEstimate = await contract.estimateGas.transfer(
          proofData.a,
          proofData.b,
          proofData.c,
          parameters.calculatedCommitment,
          parameters.newCommitment,
          parameters.changeCommitment,
          txOptions
        );

        console.log("Estimated gas:", gasEstimate.toString());
        txOptions.gasLimit = gasEstimate.mul(12).div(10); // Add 20% buffer
      } catch (gasError) {
        console.warn("Gas estimation failed, using default gas limit:", gasError.message);
      }

      // Call the contract's transfer function
      const tx = await contract.transfer(
        proofData.a,
        proofData.b,
        proofData.c,
        parameters.calculatedCommitment,
        parameters.newCommitment,
        parameters.changeCommitment,
        txOptions
      );

      console.log("Transaction sent:", tx.hash);

      // Wait for transaction to be mined with 2 confirmations
      console.log("Waiting for confirmation...");
      const receipt = await tx.wait(2);
      
      console.log("Transaction confirmed!");
      console.log("Block number:", receipt.blockNumber);
      console.log("Gas used:", receipt.gasUsed.toString());

      // Add transaction data to parameters
      parameters.transactionHash = receipt.transactionHash; // Changed from hash to transactionHash
      parameters.blockNumber = receipt.blockNumber;
      parameters.gasUsed = receipt.gasUsed.toString();

    } catch (error) {
      console.error("\n===== CONTRACT INTERACTION ERROR =====");
      console.error("Error type:", error.constructor.name);
      console.error("Error message:", error.message);
      console.error("Error code:", error.code);
      
      if (error.transaction) {
        console.error("Transaction details:", {
          from: error.transaction.from,
          to: error.transaction.to,
          data: error.transaction.data?.slice(0, 100) + "..."
        });
      }
      
      throw new Error(`Smart contract interaction failed: ${error.message}`);
    }

    console.log("parameters", parameters);

    // Find user associated with the recipientAddress
    const userAssociatedWithRecipient = await userModel.findOne({ walletAddress: recipientAddress });
    if (!userAssociatedWithRecipient) {
      return res.status(404).json({
        success: false,
        message: "User associated with the recipient address not found"
      });
    }

    // const balanceId = req.body.balanceId;
    if (!balanceId) {
      return res.status(400).json({
        success: false,
        message: "Missing required parameter: balanceId is required"
      });
    }

    const existingBalance = await BalanceModel.findById(balanceId.balance_id);
    if (!existingBalance) {
      return res.status(404).json({
        success: false,
        message: "Balance not found"
      });
    }

    existingBalance.transfersDone = existingBalance.transfersDone + 1;

    existingBalance.transferProofData = parameters;

    existingBalance.amount = existingBalance.amount - transferAmount;
    await existingBalance.save();

    // Create a new balance object for the user
    const newBalance = new BalanceModel({
      userId: userAssociatedWithRecipient._id,
      amount: transferAmount,
      tokenAddress: tokenAddress,
      transferProofData: parameters
    });

    await newBalance.save();
    
    // Return successful response
    return res.status(200).json({
      success: true,
      data: parameters
    });
    
  } catch (error) {
    console.error("Error in generateTransferProof route:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate transfer proof",
      error: error.message
    });
  }
};

function convertAddressToDecimal(address) {
  const cleanAddress = address.startsWith('0x') ? address.slice(2) : address;
  return BigInt('0x' + cleanAddress).toString();
}

/**
 * Generates unshield parameters with the given inputs
 * 
 * @param commitment The commitment hash
 * @param tokenAddress The token address
 * @param amount The amount to unshield
 * @param privateAddress The private address
 * @param blinding The blinding factor
 * @param recipientAddress The recipient's address
 * @returns The formatted parameters needed for calling the unshield function
 */
exports.generateUnshieldParameters = async (
  commitment,
  tokenAddress,
  amount,
  privateAddress,
  blinding,
  recipientAddress
) => {
  console.log("\n===== GENERATING UNSHIELD PARAMETERS =====");
  
  // Convert to string values - ZoKrates expects all numbers as strings
  const amountStr = String(amount);
  
  // Convert tokenAddress to decimal
  const tokenDecimal = tokenAddress;
  
  // Ensure privateAddress and blinding are strings
  const privateAddressStr = String(privateAddress);
  const blindingStr = String(blinding);
  
  // For logging purposes
  console.log("🔹 Commitment:", commitment);
  console.log("🔹 Token Address:", tokenAddress);
  console.log("🔹 Token Address (Decimal):", tokenDecimal);
  console.log("🔹 Amount:", amountStr);
  console.log("🔹 Private Address:", privateAddressStr);
  console.log("🔹 Recipient Address:", recipientAddress);
  console.log("🔹 Blinding Factor:", blindingStr);
  
  try {
    // Validate amount
    const amountBN = BigInt(amount);
    
    if (amountBN <= 0n) {
      throw new Error("Amount must be greater than 0");
    }
    
    // Initialize ZoKrates
    console.log("\n🔹 Initializing ZoKrates...");
    const zokratesModule = await import('zokrates-js');
    const zokratesProvider = await zokratesModule.initialize();
    
    // Read the unshield circuit source
    console.log("🔹 Reading circuit from unshield.zok...");
    const sourcePath = path.resolve(__dirname, "../circuits/unshield.zok");
    const source = fs.readFileSync(sourcePath, "utf8");
    
    // Compile the program
    console.log("🔹 Compiling ZoKrates program...");
    const artifacts = zokratesProvider.compile(source);
    
    // Remove 0x prefix from commitment if it exists
    const commitmentValue = String(commitment).startsWith('0x') 
      ? commitment.slice(2) 
      : commitment;
    
    // Convert commitment to decimal if it's in hex format
    const commitmentDecimal = String(BigInt('0x' + commitmentValue));
    
    // Ensure all values are strings for ZoKrates
    const zokratesInputs = [
      commitmentDecimal,    // Commitment in decimal form
      amountStr,            // Already converted to string
      tokenDecimal,         // Token address in decimal
      recipientAddress,    // recipient address 
      blindingStr           // Blinding factor
    ];
    
    // Compute witness
    console.log("🔹 Computing witness...");
    console.log("Inputs:", zokratesInputs);
    
    const { witness, output } = zokratesProvider.computeWitness(artifacts, zokratesInputs);
    
    console.log("🔹 Output:", output);
    
    // Parse the output - handle both string and array formats
    let calculatedCommitment, returnedPrivateAddress, returnedAmount;
    
    // Check if output is an array or a single value
    if (Array.isArray(output)) {
      // If it's an array, extract the values
      [calculatedCommitment, returnedPrivateAddress, returnedAmount] = output;
    } else {
      // If it's a single value, it might be a JSON string representation of an array
      try {
        if (typeof output === 'string' && output.startsWith('[') && output.endsWith(']')) {
          const parsedOutput = JSON.parse(output);
          [calculatedCommitment, returnedPrivateAddress, returnedAmount] = parsedOutput;
        } else {
          throw new Error("Unexpected output format from ZoKrates");
        }
      } catch (error) {
        console.error("Error parsing ZoKrates output:", error);
        throw new Error("Failed to parse ZoKrates output");
      }
    }
    
    // Clean up the string values if needed
    if (typeof calculatedCommitment === "string") calculatedCommitment = calculatedCommitment.replace(/"/g, "");
    if (typeof returnedPrivateAddress === "string") returnedPrivateAddress = returnedPrivateAddress.replace(/"/g, "");
    if (typeof returnedAmount === "string") returnedAmount = returnedAmount.replace(/"/g, "");
    
    console.log("🔹 Calculated Commitment:", calculatedCommitment);
    console.log("🔹 Returned Private Address:", returnedPrivateAddress);
    console.log("🔹 Returned Amount:", returnedAmount);
    
    // Convert commitment to hex format
    const calculatedCommitmentHex = "0x" + BigInt(calculatedCommitment).toString(16).padStart(64, "0");
    
    console.log("🔹 Calculated Commitment (hex):", calculatedCommitmentHex);
    
    // Setup or load proving/verification keys
    let provingKey, verificationKey;
    const keyDirectory = path.resolve(__dirname, "../keys");
    const provingKeyPath = path.resolve(keyDirectory, "unshield-proving.key");
    const verificationKeyPath = path.resolve(keyDirectory, "unshield-verification.key");
    
    // Create key directory if it doesn't exist
    if (!fs.existsSync(keyDirectory)) {
      fs.mkdirSync(keyDirectory, { recursive: true });
    }
    
    if (fs.existsSync(provingKeyPath) && fs.existsSync(verificationKeyPath)) {
      console.log("🔹 Loading existing proving and verification keys...");
      provingKey = fs.readFileSync(provingKeyPath);
      verificationKey = JSON.parse(fs.readFileSync(verificationKeyPath, "utf8"));
    } else {
      console.log("🔹 Generating new proving and verification keys...");
      const keys = zokratesProvider.setup(artifacts.program);
      provingKey = keys.provingKey;
      verificationKey = keys.verificationKey;
      
      // Save keys for future use
      fs.writeFileSync(provingKeyPath, Buffer.from(provingKey));
      fs.writeFileSync(verificationKeyPath, JSON.stringify(verificationKey, null, 2));
    }
    
    // Generate the proof
    console.log("🔹 Generating zero-knowledge proof...");
    const proof = zokratesProvider.generateProof(artifacts.program, witness, provingKey);
    
    // Verify the proof locally
    console.log("🔹 Verifying proof locally...");
    const isValid = zokratesProvider.verify(verificationKey, proof);
    
    if (isValid) {
      console.log("✅ Proof is valid!");
    } else {
      throw new Error("❌ Proof verification failed!");
    }
    
    // Format proof for Solidity
    const formattedProof = {
      pA: proof.proof.a,
      pB: proof.proof.b,
      pC: proof.proof.c
    };
    
    // Return the formatted parameters
    const parameters = {
      commitment: commitment,
      calculatedCommitment: calculatedCommitmentHex,
      tokenAddress: tokenAddress,
      tokenDecimal: tokenDecimal,
      amount: amount,
      privateAddress: privateAddress,
      blinding: blinding,
      recipientAddress: recipientAddress,
      pA: formattedProof.pA,
      pB: formattedProof.pB,
      pC: formattedProof.pC
    };
    
    console.log("\n===== UNSHIELD PARAMETERS =====");
    console.log("token (address):", parameters.tokenAddress);
    console.log("_pA (uint[2]):", JSON.stringify(parameters.pA));
    console.log("_pB (uint[2][2]):", JSON.stringify(parameters.pB));
    console.log("_pC (uint[2]):", JSON.stringify(parameters.pC));
    console.log("commitment (bytes32):", parameters.calculatedCommitment);
    console.log("recipient (address):", parameters.recipientAddress);
    console.log("amount (uint256):", parameters.amount);
    
    return parameters;
    
  } catch (error) {
    console.error("Error during unshield parameter generation:", error);
    throw error;
  }
};

/**
 * Route handler for generating unshield proof
 * Handles POST requests to /generate-unshield endpoint
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.generateUnshieldProof = async (req, res) => {
  console.log("generateUnshieldProof");
  try {
    const { balanceId, recipientAddress } = req.body;
    
    // if (!balanceId || !recipientAddress) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Missing required parameters: balanceId and recipientAddress are required"
    //   });
    // }
    
    // // Validate recipient address format
    // if (!recipientAddress.startsWith("0x") || recipientAddress.length !== 42) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Invalid recipient address format. Must be a valid Ethereum address"
    //   });
    // }
    
    console.log("balanceId", typeof balanceId === 'object' ? balanceId.balance_id : balanceId);
    
    // Find the balance record by ID
    const balanceIdValue = typeof balanceId === 'object' ? balanceId.balance_id : balanceId;
    const balance = await BalanceModel.findById(balanceIdValue);
    
    if (!balance) {
      return res.status(404).json({
        success: false,
        message: "Balance record not found"
      });
    }
    
    console.log("Found balance:", balance);
    
    // Extract the required fields from the balance document

    // const commitment = balance.transferProofData.newCommitment;
    const commitment = balance.transferProofData.changeCommitment;
    const tokenAddress = balance.transferProofData.tokenAddress;
    // const amount = balance.transferProofData.transferAmount;
    const amount = "3000000000000000000";
    // const blinding = balance.transferProofData.newBlinding;
    const blinding = balance.transferProofData.changeBlinding;
    
    // Get the private address from the user document
    // const user = await userModel.findById(balance.userId);
    // if (!user || !user.privateAddress) {
    //   return res.status(404).json({
    //     success: false,
    //     message: "User or private address not found for this balance"
    //   });
    // }
    
    const privateAddress = balance.transferProofData.privateAddress;
    const recipientAddress2 = balance.transferProofData.recipientAddress;
    // const recipientAddress2 = "0x2f5fb91a3c68db53b0776ecd068370bcbd757986";

    console.log("privateAddress", privateAddress);
    console.log("recipientAddress2", recipientAddress2);
    console.log({
      commitment,
      tokenAddress,
      amount,
      privateAddress,
      blinding,
      recipientAddress2
    });
    
    // Validate that we have all required data
    if (!commitment || !tokenAddress || !amount || !privateAddress || !blinding) {
      return res.status(400).json({
        success: false,
        message: "Missing required data in the balance record"
      });
    }
    
    // Generate unshield parameters

   
     const parameters = await exports.generateUnshieldParameters(
        commitment,
        tokenAddress,
        amount,
        privateAddress,
        blinding,
        recipientAddress2
        );
   

    // Interact with the smart contract to unshield the amount
    try {
      console.log("\n===== STARTING CONTRACT INTERACTION FOR UNSHIELDING =====");
      
      // Create wallet instance from private key
      const privateKey = '00981b6308651206464fafe3648945531c42bee916e0b03def2b92fcd0acfda0';
      const wallet = new ethers.Wallet(privateKey, provider);
      
      // Create contract instance
      const contract = new ethers.Contract(contractAddress, contractABI, wallet);
      
      // Format the parameters
      const formattedParams = {
        tokenAddress: ethers.utils.getAddress("0x7e4d8DFF54a2d466f6A656336dB0368B61852f15"), // Ensure proper checksum
        proofA: parameters.pA,
        proofB: parameters.pB,
        proofC: parameters.pC,
        commitment: parameters.calculatedCommitment,
        recipient: ethers.utils.getAddress(recipientAddress), // Ensure proper checksum
        amount: amount.toString()
      };

      console.log("Formatted parameters:", formattedParams);

      // Prepare transaction options
      const txOptions = {
        gasLimit: 1000000,
        maxFeePerGas: ethers.utils.parseUnits("6", "gwei"),
        maxPriorityFeePerGas: ethers.utils.parseUnits("6", "gwei")
      };

      // Send transaction
      const tx = await contract.unshield(
        formattedParams.tokenAddress,
        formattedParams.proofA,
        formattedParams.proofB,
        formattedParams.proofC,
        formattedParams.commitment,
        formattedParams.recipient,
        formattedParams.amount,
        txOptions
      );

      console.log("Transaction sent:", tx.hash);

      // Wait for confirmation
      const receipt = await tx.wait(1);
      console.log("Transaction confirmed in block:", receipt.blockNumber);

    } catch (error) {
      console.error("\n===== CONTRACT INTERACTION ERROR FOR UNSHIELDING =====");
      console.error("Error details:", {
        message: error.message,
        code: error.code,
        type: error.constructor.name
      });
      
      throw new Error(`Smart contract interaction failed: ${error.message}`);
    }

    
    // Mark the balance as unshielded (optional)
    balance.unshielded = true;
    balance.unshieldData = {
      recipientAddress,
      timestamp: new Date(),
      parameters: parameters
    };
    await balance.save();
    
    // Return successful response
    return res.status(200).json({
      success: true,
      data: parameters
    });
    
  } catch (error) {
    console.error("Error in generateUnshieldProof route:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate unshield proof",
      error: error.message
    });
  }
};
