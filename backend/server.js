const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const axios = require('axios');

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const MAX_PLAYERS = 5;
const TOTAL_ROUNDS = 3;
const TIME_LIMIT = 30;
const TOPICS = ['Cat', 'Tree', 'Sun', 'House', 'Car', 'Apple', 'Robot', 'Fish', 'Moon', 'Star'];

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || null;

let rooms = {}; 

async function getAIScore(topic, imageBase64) {
    if (AI_SERVICE_URL) {
        try {
            const response = await axios.post(`${AI_SERVICE_URL}/rate`, {
                topic: topic,
                image: imageBase64
            });
            return response.data.score;
        } catch (error) {
            return Math.floor(Math.random() * 30) + 50; 
        }
    } else {
        return Math.floor(Math.random() * 40) + 60; 
    }
}

io.on('connection', (socket) => {
    socket.on('joinRoom', ({ name, roomCode }) => {
        if (!rooms[roomCode]) {
            rooms[roomCode] = { players: [], round: 0, state: 'waiting', topic: '', submissions: 0 };
        }
        const room = rooms[roomCode];

        if (room.players.length >= MAX_PLAYERS) {
            socket.emit('errorMsg', 'Room is full!');
            return;
        }
        if (room.state !== 'waiting') {
            socket.emit('errorMsg', 'Game in progress!');
            return;
        }

        const player = { id: socket.id, name, score: 0 };
        room.players.push(player);
        socket.join(roomCode);

        io.to(roomCode).emit('updatePlayerList', room.players);

        if (room.players.length === MAX_PLAYERS) {
            startGame(roomCode);
        }
    });

    socket.on('submitDrawing', async ({ roomCode, image }) => {
        const room = rooms[roomCode];
        if (!room || room.state !== 'drawing') return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        const points = await getAIScore(room.topic, image);
        player.score += points;
        room.submissions++;

        socket.emit('drawingRated', { points, total: player.score });

        if (room.submissions === room.players.length) {
            endRound(roomCode);
        }
    });
});

function startGame(roomCode) {
    const room = rooms[roomCode];
    room.state = 'drawing';
    room.round = 1;
    startRound(roomCode);
}

function startRound(roomCode) {
    const room = rooms[roomCode];
    if(!room) return;
    
    room.submissions = 0;
    room.topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
    
    io.to(roomCode).emit('newRound', {
        round: room.round,
        totalRounds: TOTAL_ROUNDS,
        topic: room.topic,
        timeLimit: TIME_LIMIT
    });

    let timeLeft = TIME_LIMIT;
    const timer = setInterval(() => {
        if (!rooms[roomCode]) { clearInterval(timer); return; }
        
        io.to(roomCode).emit('timerUpdate', timeLeft);
        timeLeft--;

        if (timeLeft < 0 || room.submissions === room.players.length) {
            clearInterval(timer);
            if (room.submissions < room.players.length) endRound(roomCode);
        }
    }, 1000);
}

function endRound(roomCode) {
    const room = rooms[roomCode];
    if(!room) return;

    room.players.sort((a, b) => b.score - a.score);
    io.to(roomCode).emit('roundEnded', room.players);

    if (room.round >= TOTAL_ROUNDS) {
        io.to(roomCode).emit('gameOver', room.players[0]);
        delete rooms[roomCode];
    } else {
        room.round++;
        setTimeout(() => startRound(roomCode), 5000);
    }
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Backend Server running on port ${PORT}`));
