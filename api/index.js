const express = require('express');
const mysql = require('mysql2/promise');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const http = require('http'); // We use HTTP instead of HTTPS here
const { Server } = require("socket.io");

// Load environment variables
dotenv.config();
const app = express();

app.use(express.json());
app.use('/uploads', express.static(__dirname + '/uploads'));
app.use(cookieParser());
app.use(cors({
    credentials: true,
    origin: process.env.REACT_APP_API_URL,
}));

const jwtSecret = process.env.JWT_SECRET;
const bcryptSalt = bcrypt.genSaltSync(10);

// Create a connection pool for efficient handling of connections
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function getUserData(req) {
    return new Promise((resolve, reject) => {
        const token = req.cookies?.token;
        if (token) {
            jwt.verify(token, jwtSecret, {}, (err, data) => {
                if (err) throw err;
                resolve(data);
            });
        } else {
            reject('no token');
        }
    });
}

// Test route
app.get("/api", (req, res) => {
    res.json("API is working!");
});

app.get('/api/messages/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const userData = await getUserData(req);
        const sql = "SELECT * FROM messages WHERE sender IN (?, ?) AND recipient IN (?, ?) ORDER BY created_at ASC";
        const [result] = await pool.execute(sql, [userId, userData.userId, userId, userData.userId]);
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/people', async (req, res) => {
    try {
        const sql = "SELECT id, username FROM users";
        const [result] = await pool.execute(sql);
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/profile', (req, res) => {
    const token = req.cookies?.token;
    if (token) {
        jwt.verify(token, jwtSecret, {}, (err, data) => {
            if (err) throw err;
            res.json({ data });
        });
    } else {
        res.status(401).json('no token');
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const sql = "SELECT * FROM users WHERE username = ?";
        const [result] = await pool.execute(sql, [username]);

        if (result.length > 0) {
            const user = result[0];
            const passOk = bcrypt.compareSync(password, user.password);
            if (passOk) {
                const userId = user.id;
                jwt.sign({ userId, username }, jwtSecret, { expiresIn: '1h' }, (err, token) => {
                    if (err) throw err;
                    res.cookie('token', token, { sameSite: 'None', secure: true })
                        .status(201).json({ id: userId });
                });
            } else {
                res.status(401).json({ message: "Invalid password" });
            }
        } else {
            res.status(401).json({ message: "Invalid username" });
        }
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: "Database error" });
    }
});

app.post('/api/logout', (req, res) => {
    res.cookie('token', '', { sameSite: 'none', secure: true }).json('ok');
});

app.post("/api/register", async (req, res) => {
    const { username, password } = req.body;
    try {
        const hashedPassword = bcrypt.hashSync(password, bcryptSalt);
        const sql = "INSERT INTO users (username, password) VALUES (?, ?)";
        const [result] = await pool.execute(sql, [username, hashedPassword]);
        const userId = result.insertId;

        jwt.sign({ userId, username }, jwtSecret, { expiresIn: '1h' }, (err, token) => {
            if (err) throw err;
            res.cookie('token', token, { sameSite: 'none', secure: true })
                .status(201).json({ id: userId });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Database error" });
    }
});

// Create an HTTP server
const server = http.createServer(app);

// Create Socket.IO server
const io = new Server(server, {
    cors: {
        origin: process.env.REACT_APP_API_URL, // Frontend URL
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Middleware to check JWT and assign user data to socket
io.use((socket, next) => {
    const token = socket.handshake.headers.cookie?.split(';').find(str => str.trim().startsWith('token='));
    if (token) {
        const tokenValue = token.split('=')[1];
        jwt.verify(tokenValue, jwtSecret, {}, (err, decoded) => {
            if (err) return next(new Error('Authentication error'));
            socket.userId = decoded.userId;
            socket.username = decoded.username;
            next();
        });
    } else {
        next(new Error('No token'));
    }
});

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.username}`);

    // Notify other clients that a user has joined
    io.emit('onlineUsers', [...io.sockets.sockets].map(([id, client]) => ({
        userId: client.userId,
        username: client.username
    })));

    socket.on('sendMessage', async ({ recipient, text, file }) => {
        let filename = null;
        if (file) {
            const parts = file.name.split('.');
            const ext = parts[parts.length - 1];
            filename = Date.now() + '.' + ext;
            const path = __dirname + '/uploads/' + filename;
            const bufferData = new Buffer(file.data.split(',')[1], 'base64');
            fs.writeFile(path, bufferData, () => {
                console.log("File saved to " + path);
            });
        }

        if (recipient && (text || file)) {
            let sql = "INSERT INTO messages (sender, recipient, text, file) VALUES (?, ?, ?, ?)";
            const [result] = await pool.execute(sql, [socket.userId, recipient, text, filename]);

            // Send message to the recipient
            io.to(recipient).emit('receiveMessage', {
                text,
                sender: socket.userId,
                recipient,
                file: filename,
                id: result.insertId
            });
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.username}`);
        // Notify all clients about the disconnect
        io.emit('onlineUsers', [...io.sockets.sockets].map(([id, client]) => ({
            userId: client.userId,
            username: client.username
        })));
    });
});

// Start the server on the specified port
const PORT = process.env.PORT || 4040;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
