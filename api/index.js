const express = require('express');
const mysql = require('mysql2/promise'); // Use promise-based mysql2
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const ws = require('ws')
const {response} = require("express");
const fs = require('fs');

// Load environment variables
dotenv.config();
app.use(express.json());
app.use(express.static(path.resolve(__dirname, "/build"))); // path.resolve was missing here
app.get("/*", (req, res) =>
    res.sendFile(path.resolve(__dirname, "/build", "index.html"))
);
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
            reject('no token')
        }
    })

}

// Test route
app.get("/api", (req, res) => {
    res.json("test kk");
});


app.get('/api/messages/:userId', async (req, res) => {
    const {userId} = req.params;
    const userData = await getUserData(req);
    let sql = "SELECT * FROM messages WHERE sender IN (?, ?) AND recipient IN (?, ?) ORDER BY created_at ASC";
    try {
        const [result] = await pool.execute(sql, [userId, userData.userId, userId, userData.userId]);

        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({error: err});
    }

});

app.get('/api/people', async (req, res) => {
    sql = "SELECT id, username FROM users";

    try {
        const [result] = await pool.execute(sql);
        res.json(result);

    } catch (err) {
        console.error(err);
        res.status(500).json({error: err});
    }
})

app.get('/api/profile', (req, res) => {
    const token = req.cookies?.token;
    if (token) {
        jwt.verify(token, jwtSecret, {}, (err, data) => {
            if (err) throw err;
            res.json({data});
        })
    } else {
        res.status(401).json('no token')
    }
})

app.post('/api/login', async (req, res) => {
    const {username, password} = req.body;

    let sql = "SELECT * FROM users WHERE username = ?"
    try {
        const [result] = await pool.execute(sql, [username]);

        if (result.length > 0) {
            const user = result[0]
            const passOk = bcrypt.compareSync(password, user.password);
            if (passOk) {
                const userId = user.id
                jwt.sign({userId, username}, jwtSecret, {},(err, token)=>{
                    if (err) throw err;
                    res.cookie('token', token, {sameSite:'None', secure:true}).status(201).json({
                        id: userId,
                    });
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
    res.cookie('token', '', {sameSite:'none', secure:true}).json('ok');
})

// Register route
app.post("/api/register", async (req, res) => {
    const { username, password } = req.body;

    let sql = "INSERT INTO users (username, password) VALUES (?, ?)";

    try {
        const hashedPassword = bcrypt.hashSync(password, bcryptSalt);
        // Execute the SQL query using the connection pool
        const [result] = await pool.execute(sql, [username, hashedPassword]);
        const userId = result.insertId;

        jwt.sign({userId, username}, jwtSecret, {},(err, token)=>{
            if (err) throw err;
            res.cookie('token', token, {sameSite:'none', secure:true}).status(201).json({
                id: userId,
            });
        })

        // Send back a success response
        // res.status(201).json({ message: "User registered successfully", userId});
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Database error" });
    }
});

// Start the server
const PORT = process.env.PORT || 4040;

const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

const wss = new ws.WebSocketServer({server})

wss.on('connection', (connection, req) => {

    function notifyOnline() {
        [...wss.clients].forEach(client => {
            client.send(JSON.stringify({
                    online: [...wss.clients].map(c => ({userId: c.userId, username:c.username}))
                }
            ));
        });
    }

    connection.isAlive = true;

    connection.timer = setInterval(() => {
        connection.ping();
        connection.deathTimer = setTimeout(() => {
            connection.isAlive = false;
            clearInterval(connection.timer)
            connection.terminate();
            notifyOnline();
            console.log("dead");
        }, 1000);
    }, 3000);

    connection.on('pong', () => {
        clearTimeout(connection.deathTimer)
    });

    const cookies = req.headers.cookie;
    if (cookies) {
        const tokenCookieString = cookies.split(';').find(str => str.startsWith('token='));
        if(tokenCookieString) {
            const token = tokenCookieString.split('=')[1];
            if(token) {
                jwt.verify(token, jwtSecret, {}, (err, data) => {
                    if(err) throw err;
                    const {userId, username} = data;
                    connection.userId = userId;
                    connection.username = username;
                });
            }
        }
    }

    connection.on('message', async (message) => {
        const messageData = JSON.parse(message.toString());
        const {recipient, text, file} = messageData;
        let filename = null;
        if (file) {
            const parts = file.name.split('.');
            const ext = parts[parts.length - 1];
            filename = Date.now() + '.' + ext;
            const path = __dirname + '/uploads/' + filename;
            const bufferData = new Buffer(file.data.split(',')[1], 'base64');
            fs.writeFile(path, bufferData, () => {
                console.log("file saved" + path);
            });
        }
        if(recipient && (text || file)) {
            let sql = "INSERT INTO messages (sender, recipient, text, file) VALUES (?, ?, ?, ?)";
            const [result] = await pool.execute(sql, [connection.userId, recipient, text, filename]);
            [...wss.clients]
                .filter(c => c.userId.toString() === recipient)
                .forEach(c => c.send(JSON.stringify({
                    text,
                    sender: connection.userId,
                    recipient,
                    file: file ? filename : null,
                    id: result.insertId,

                })));
        }
    });
    notifyOnline();
});

wss.on('close', data => {
    console.log('Connection closed', data);
});


