const express = require("express"); // Import Express framework
const cors = require("cors"); // Import CORS middleware
const bodyParser = require("body-parser"); // Import body-parser to handle JSON
const mongoose = require("mongoose"); // Import Mongoose for MongoDB

const app = express(); // Initialize Express app
const PORT = process.env.PORT || 3000; // Define server port

app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(bodyParser.json()); // Configure app to parse JSON bodies

/* 🔌 CONNECT TO MONGODB */
const MONGO_URI =
  "mongodb+srv://admin:12344321@cluster0.buc1m7q.mongodb.net/carpoolDB"; // DB Connection string

async function connectDB() {
  // Define async connection function
  try {
    // Try block for connection
    await mongoose.connect(MONGO_URI, {
      // Attempt connection
      serverSelectionTimeoutMS: 5000, // 5 second connection timeout
    }); // Close connect call
    console.log("✅ MongoDB connected"); // Log success
  } catch (err) {
    // Catch connection errors
    console.error("❌ MongoDB connection failed:", err.message); // Log error message

    // Retry after 5 seconds
    setTimeout(connectDB, 5000); // Recursive retry after delay
  } // Close catch block
} // Close function

connectDB(); // Execute connection function

mongoose.connection.on("connected", () => {
  // Event listener: Connected
  console.log("🟢 MongoDB connected"); // Log connection status
}); // Close listener

mongoose.connection.on("disconnected", () => {
  // Event listener: Disconnected
  console.log("🟡 MongoDB disconnected"); // Log disconnection status
}); // Close listener

mongoose.connection.on("error", (err) => {
  // Event listener: Error
  console.log("🔴 MongoDB error:", err.message); // Log runtime errors
}); // Close listener

/* 📦 SCHEMA */
const rideSchema = new mongoose.Schema({
  // Define DB record structure
  name: String, // Driver name field
  phone: String, // Driver phone field
  direction: String, // Ride direction field
  location: String, // Pickup location field
  datetime: Date, // Departure time field
  seats: Number, // Available seats field
  driverId: String, // Driver ID for ownership checks
  passengers: [String], // List of passenger IDs
}); // Close schema definition

const Ride = mongoose.model("Ride", rideSchema); // Create model from schema

/* 🧹 AUTO DELETE EXPIRED RIDES */
async function deleteExpiredRides() {
  // Cleanup function
  if (mongoose.connection.readyState !== 1) return; // Check DB connection state

  try {
    // Try block for deletion
    const now = new Date(); // Get current timestamp
    await Ride.deleteMany({ datetime: { $lt: now } }); // Remove past rides
  } catch (err) {
    // Catch deletion errors
    console.error("Delete expired failed:", err.message); // Log failure
  } // Close catch
} // Close function

/* 📥 GET RIDES (sorted + cleaned) */
app.get("/rides", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database not connected" });
    }

    await deleteExpiredRides(); // remove expired rides first
    const rides = await Ride.find().sort({ datetime: 1 });
    res.json(rides);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch rides" });
  }
});

/* 📤 POST RIDE */
app.post("/rides", async (req, res) => {
  // Create ride endpoint
  console.log("New ride data:", req.body);
  try {
    // Try block for POST
    if (mongoose.connection.readyState !== 1) {
      // Validate DB connection
      return res.status(503).json({ error: "Database not connected" }); // Return error if down
    } // Close if

    const ride = new Ride(req.body); // Initialize new ride from body
    await ride.save(); // Persist ride to database

    res.json({ message: "Ride added" }); // Return success response
  } catch (err) {
    // Catch creation errors
    res.status(500).json({ error: "Failed to add ride" }); // Return server error
  } // Close catch
}); // Close route

// PATCH ride to update passengers
app.patch("/rides/:id", async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride) return res.status(404).json({ error: "Ride not found" });

    ride.passengers = req.body.passengers || [];
    await ride.save();

    res.json({ message: "Ride updated" });
  } catch (err) {
    res.status(500).json({ error: "Failed to update ride" });
  }
});

const path = require("path");

// Serve all static files (index.html, style.css, script.js)
app.use(express.static(path.join(__dirname)));

// Root route to serve index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// DELETE RIDE
app.delete("/rides/:id", async (req, res) => {
  try {
    await Ride.findByIdAndDelete(req.params.id);
    res.json({ message: "Ride deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete ride" });
  }
});

// PATCH RIDE (for joining)
app.patch("/rides/:id/join", async (req, res) => {
  try {
    const { userId } = req.body;
    const ride = await Ride.findById(req.params.id);

    if (!ride) return res.status(404).json({ error: "Ride not found" });

    if (ride.driverId === userId)
      return res.status(400).json({ error: "Driver cannot join" });

    if (ride.passengers.includes(userId))
      return res.status(400).json({ error: "Already joined" });

    if (ride.seats <= 0)
      return res.status(400).json({ error: "No seats left" });

    ride.passengers.push(userId);
    ride.seats -= 1;

    await ride.save();

    res.json({ message: "Joined successfully" });
  } catch (err) {
    res.status(500).json({ error: "Join failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
