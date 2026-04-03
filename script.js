fetch("/rides")
  .then((res) => res.json())
  .then((data) => console.log(data));

const API_URL = window.location.origin + "/rides";

// assign a persistent user ID in localStorage
let userId = localStorage.getItem("userId");
if (!userId) {
  userId = crypto.randomUUID(); // unique identifier for this browser
  localStorage.setItem("userId", userId);
}

// Parse a "YYYY-MM-DDTHH:MM" string as local time (avoids 3h shift)
function parseLocalDate(input) {
  const [datePart, timePart] = input.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute); // month is 0-indexed
}

// ---------------------- MAP ----------------------

let map, marker;
let selectedCoordinates = null;

function formatPhone(phone) {
  if (!phone) return "";

  // remove everything except digits
  let clean = phone.replace(/\D/g, "");

  // Lebanese numbers (8 digits)
  if (clean.length === 8) {
    // add country code
    clean = "961" + clean;
  }

  // If starts with 0 and is 9 digits → remove 0 and add 961
  if (clean.length === 9 && clean.startsWith("0")) {
    clean = "961" + clean.slice(1);
  }

  // Now format +961XXXXXXXX
  if (clean.startsWith("961") && clean.length === 11) {
    return clean.replace(/(961)(\d{2})(\d{3})(\d{3})/, "+$1 $2 $3 $4");
  }

  // fallback: just group digits nicely
  return clean.replace(/(\+?\d{1,3})(\d{3})(\d{3})(\d+)/, "$1 $2 $3 $4");
}

// ---------------------- MAP ----------------------
document.addEventListener("DOMContentLoaded", () => {
  map = L.map("locationMap").setView([33.9, 35.8], 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap",
  }).addTo(map);

  const locationInput = document.getElementById("location");

  locationInput.addEventListener("input", async () => {
    const value = locationInput.value;
    if (value.length < 3) return;

    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(value)}`,
    );
    const data = await res.json();

    if (data && data[0]) {
      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);
      map.setView([lat, lon], 14);

      if (marker) marker.setLatLng([lat, lon]);
      else {
        marker = L.marker([lat, lon], { draggable: true }).addTo(map);
        marker.on("dragend", (e) => {
          selectedCoordinates = e.target.getLatLng();
        });
      }

      selectedCoordinates = { lat, lng: lon };
    }
  });

  map.on("click", (e) => {
    const { lat, lng } = e.latlng;
    if (marker) marker.setLatLng([lat, lng]);
    else {
      marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      marker.on("dragend", (e) => {
        selectedCoordinates = e.target.getLatLng();
      });
    }
    selectedCoordinates = { lat, lng };

    fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
    )
      .then((res) => res.json())
      .then((data) => {
        if (data && data.display_name) locationInput.value = data.display_name;
      });
  });
});

// ------------------ VALIDATION ------------------
function validatePhoneInput(input) {
  const error = document.getElementById("phoneError");
  const value = input.value;
  if (!/^\+?[0-9]*$/.test(value))
    error.textContent = "Only + and numbers allowed";
  else if (value.length > 0 && value.length < 7)
    error.textContent = "Too short";
  else error.textContent = "";
}

function validateRide(ride) {
  if (!ride.name || ride.name.length < 2) return "Name too short";
  if (!/^\+?[0-9]{7,14}$/.test(ride.phone)) return "Invalid phone number";
  if (!ride.direction) return "Select direction";
  if (!ride.location) return "Enter your location";
  if (!ride.datetime) return "Select date & time";
  if (!ride.seats || ride.seats <= 0) return "Seats must be more than 0";
  if (ride.seats > 6) return "Seats cannot exceed 6";
  return null;
}

function timeRemaining(datetime) {
  const now = new Date();
  const rideTime = new Date(datetime);
  let diff = rideTime - now;

  if (diff <= 0) return "Expired";

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);

  const remMinutes = minutes % 60;
  const remHours = hours % 24;
  const remDays = days % 30;

  // build clean string
  let parts = [];

  if (months > 0) parts.push(`${months} mo`);
  if (remDays > 0) parts.push(`${remDays} d`);
  if (remHours > 0) parts.push(`${remHours} hr`);
  if (remMinutes > 0) parts.push(`${remMinutes} min`);

  // 🔥 fix ugly "0 min"
  if (parts.length === 0) return "Less than a minute";

  return parts.join(" ") + " left";
}

// ------------------ LOAD RIDES ------------------
async function loadRides() {
  const res = await fetch(API_URL);
  let rides = await res.json();

  rides = rides.filter((r) => new Date(r.datetime) > new Date());
  rides.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

  const searchInput = document.getElementById("search");
  const filterInput = document.getElementById("filterDirection");

  const search = searchInput ? searchInput.value.toLowerCase() : "";
  const filterDirection = filterInput ? filterInput.value : "";

  rides = rides.filter((r) => {
    const combined = `${r.name} ${r.location} ${r.direction}`.toLowerCase();
    return (
      (!search || combined.includes(search)) &&
      (!filterDirection || r.direction === filterDirection)
    );
  });

  const ridesList = document.getElementById("ridesList");
  if (!ridesList) return;
  ridesList.innerHTML = "";

  if (rides.length === 0) {
    ridesList.innerHTML = `<div class="no-rides">No rides available</div>`;
    return;
  }

  rides.forEach((ride) => {
    const date = new Date(ride.datetime);
    const div = document.createElement("div");

    const currentPassengers = ride.passengers?.length || 0;

    const totalSeats = ride.seats; // actual seats in DB
    const remainingSeats = totalSeats - currentPassengers;

    div.className = "ride"; // reset class
    if (remainingSeats <= 0) div.classList.add("full");
    else if (remainingSeats === 1) div.classList.add("almost-full");

    const formattedDate = date.toLocaleString([], {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

    const rawPhone = ride.phone.replace(/\D/g, "");

    // normalize for calling
    let callPhone = rawPhone;
    if (rawPhone.length === 8) callPhone = "961" + rawPhone;
    if (rawPhone.length === 9 && rawPhone.startsWith("0"))
      callPhone = "961" + rawPhone.slice(1);

    div.innerHTML = `
    <p><strong>${ride.direction}</strong></p>
    <p>Location: ${ride.location}</p>
    <p>Date: ${formattedDate}</p>
    <p>⏳ ${timeRemaining(ride.datetime)}</p>
    <p>Seats: ${currentPassengers} / ${totalSeats}</p>
    <div class="seats-bar">
    <div class="seats-fill" style="width: ${Math.min(
      (currentPassengers / totalSeats) * 100,
      100,
    )}%"></div>
    </div>
    <p>Driver: ${ride.name}</p>
    <p>Phone: 
    <a href="tel:+${callPhone}" class="phone-link">
    ${formatPhone(ride.phone)}
    </a>
    </p>
    <div class="ride-message" style="color: red; margin-bottom: 5px;"></div>
    <button class="join-btn">
      Join
    </button>
    <button class="delete-btn">
      Delete
    </button>
    `;

    const messageDiv = div.querySelector(".ride-message");

    // JOIN button logic
    div.querySelector(".join-btn").addEventListener("click", () => {
      const userId = localStorage.getItem("userId");

      if (userId === ride.driverId || userId === ride.name) {
        messageDiv.textContent = "You cannot join your own ride!";
        return;
      }

      if (ride.passengers?.includes(userId)) {
        messageDiv.textContent = "You already joined this ride!";
        return;
      }

      if (remainingSeats <= 0) {
        messageDiv.textContent = "Ride is full!";
        return;
      }

      joinRide(ride, userId, messageDiv);
    });

    // DELETE button logic
    div.querySelector(".delete-btn").addEventListener("click", async () => {
      const userId = localStorage.getItem("userId");
      if (userId !== ride.driverId) {
        messageDiv.textContent = "Only the driver can delete this ride!";
        return;
      }

      await fetch(`${API_URL}/${ride._id}`, { method: "DELETE" });
      messageDiv.textContent = "Ride deleted";
      loadRides();
    });

    // disable join if full
    if (remainingSeats <= 0) div.querySelector(".join-btn").disabled = true;

    document.getElementById("ridesList").appendChild(div);
  });
}

// ------------------ DELETE RIDE ------------------

async function deleteRide(ride, messageDiv) {
  const userId = localStorage.getItem("userId");

  // Check driver
  if (userId !== ride.driverId) {
    messageDiv.textContent = "Only the driver can delete this ride";
    return;
  }

  // Confirm deletion with inline message (instead of browser confirm)
  const confirmDelete = confirm("Are you sure you want to delete this ride?");
  if (!confirmDelete) return;

  try {
    const res = await fetch(`${API_URL}/${ride._id}`, { method: "DELETE" });
    if (res.status === 200) {
      messageDiv.textContent = "Ride deleted successfully!";
      loadRides(); // Refresh rides
    } else {
      const data = await res.json();
      messageDiv.textContent = data.error || "Failed to delete ride";
    }
  } catch (err) {
    messageDiv.textContent = "Failed to delete ride. Try again.";
  }
}

async function joinRide(ride, userId, messageDiv) {
  if (!userId) return;

  if (userId === ride.driverId || userId === ride.name) {
    messageDiv.textContent = "You cannot join your own ride!";
    return;
  }

  if (ride.passengers?.includes(userId)) {
    messageDiv.textContent = "You already joined this ride!";
    return;
  }

  if ((ride.passengers?.length || 0) >= ride.seats) {
    messageDiv.textContent = "Ride is full!";
    return;
  }

  try {
    const res = await fetch(`${API_URL}/${ride._id}/join`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });

    const data = await res.json();

    if (res.status !== 200) {
      messageDiv.textContent = data.error || "Join failed";
      return;
    }

    messageDiv.textContent = "Joined successfully!";
    loadRides();
  } catch (err) {
    messageDiv.textContent = "Server error. Try again.";
  }
}

// ------------------ POST RIDE ------------------
document.getElementById("rideForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const driverId = localStorage.getItem("userId") || crypto.randomUUID();
  localStorage.setItem("userId", driverId);

  const ride = {
    name: document.getElementById("name").value.trim(),
    phone: document.getElementById("phone").value.trim(),
    direction: document.getElementById("direction").value,
    location: document.getElementById("location").value.trim(),
    datetime: parseLocalDate(
      document.getElementById("datetime").value,
    ).toISOString(),
    seats: parseInt(document.getElementById("seats").value),
    driverId: driverId,
    passengers: [], // track who joined
  };

  const rideDate = parseLocalDate(document.getElementById("datetime").value);
  if (rideDate < new Date()) {
    document.getElementById("formError").textContent =
      "Date & time cannot be in the past!";
    return;
  }
  const error = validateRide(ride);
  if (error) {
    document.getElementById("formError").textContent = error;
    return;
  }
  document.getElementById("formError").textContent = "";

  await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ride),
  });

  document.getElementById("rideForm").reset();
  selectedCoordinates = null;
  if (marker) marker.remove();

  loadRides();
});

setInterval(loadRides, 5000);
loadRides();
