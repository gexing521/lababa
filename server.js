const express = require('express');
const { createServer } = require('node:http');
const { Server } = require('socket.io');

const MAX_OCCUPANCY = 20;
const PORT = 3000;

class ToiletManager {
  constructor() {
    this.occupied = new Set();
    this.waitingQueue = [];
    this.userMap = new Map();
  }

  assignSeat(socketId) {
    if (this.occupied.size >= MAX_OCCUPANCY) {
      this.waitingQueue.push(socketId);
      return { status: 'waiting', position: this.waitingQueue.length };
    }
    
    const seatNumber = this.findAvailableSeat();
    this.occupied.add(seatNumber);
    this.userMap.set(socketId, seatNumber);
    return { status: 'using', seatNumber };
  }

  findAvailableSeat() {
    for (let i=1; i<=MAX_OCCUPANCY; i++) {
      if (!this.occupied.has(i)) return i;
    }
    return null;
  }

  releaseSeat(socketId) {
    const seat = this.userMap.get(socketId);
    if (seat) {
      this.occupied.delete(seat);
      this.userMap.delete(socketId);
      this.assignNextInQueue();
    }
  }

  assignNextInQueue() {
    if (this.waitingQueue.length > 0 && this.occupied.size < MAX_OCCUPANCY) {
      const nextUser = this.waitingQueue.shift();
      const seatNumber = this.findAvailableSeat();
      this.occupied.add(seatNumber);
      this.userMap.set(nextUser, seatNumber);
      return seatNumber;
    }
  }

  getStats() {
    return {
      using: this.occupied.size,
      waiting: this.waitingQueue.length
    };
  }
}

// 初始化服务器
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const toiletManager = new ToiletManager();

// 配置静态文件
app.use(express.static('public'));

// WebSocket连接处理
io.on('connection', (socket) => {
  // 分配马桶位置
  const assignment = toiletManager.assignSeat(socket.id);
  socket.emit('statusUpdate', assignment);
  io.emit('statsUpdate', toiletManager.getStats());

  // 心跳检测
  const heartbeat = setInterval(() => {
    socket.emit('heartbeat');
  }, 5000);

  // 断开处理
  socket.on('disconnect', () => {
    clearInterval(heartbeat);
    toiletManager.releaseSeat(socket.id);
    io.emit('statsUpdate', toiletManager.getStats());
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});