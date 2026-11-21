import express from 'express';
import {createServer} from 'node:http';
import {Server} from 'socket.io';
import {randomBytes,randomInt} from 'node:crypto';
import {makeGame,makePlayer,startRound,bid,play,finishTrick,view,SUITS} from './engine.js';
const app=express(),server=createServer(app),io=new Server(server,{cors:{origin:false}});
app.use(express.static('public',{maxAge:'1h'}));app.get('/engine.js',(_,res)=>res.sendFile(new URL('./engine.js',import.meta.url).pathname));app.get('/health',(_,res)=>res.json({ok:true}));
const rooms=new Map(),MAX_ROOMS=300,ROOM_TTL=1000*60*60*12;
const code=()=>Array.from({length:6},()=> 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)]).join('');
const token=()=>randomBytes(24).toString('hex');
function publish(g){g.updatedAt=Date.now();g.players.forEach((p,i)=>{if(p.socketId)io.to(p.socketId).emit('state',view(g,i))})}
function fail(cb,message){cb?.({ok:false,error:message})}
function find(socket){const g=rooms.get(socket.data.code);if(!g)throw Error('Room unavailable');const i=g.players.findIndex(p=>p.token===socket.data.token&&p.socketId===socket.id);if(i<0)throw Error('Session expired');return [g,i]}
function action(socket,cb,fn){try{const [g,i]=find(socket);fn(g,i);publish(g);cb?.({ok:true})}catch(e){socket.emit('toast',e.message);fail(cb,e.message)}}
function bind(socket,g,p){if(p.socketId&&p.socketId!==socket.id)io.to(p.socketId).emit('sessionReplaced');p.socketId=socket.id;p.connected=true;socket.data.code=g.code;socket.data.token=p.token;socket.join(g.code);publish(g)}
io.on('connection',socket=>{
 socket.on('create',({name,variant}={},cb)=>{if(rooms.size>=MAX_ROOMS)return fail(cb,'Server is busy. Try later.');let id;do{id=code()}while(rooms.has(id));const t=token(),g=makeGame(id,name,t,{variant});g.players[0].socketId=socket.id;rooms.set(id,g);bind(socket,g,g.players[0]);cb?.({ok:true,code:id,token:t})});
 socket.on('join',({name,code:raw}={},cb)=>{const id=String(raw||'').trim().toUpperCase(),g=rooms.get(id);if(!g)return fail(cb,'Room not found');if(g.phase!=='lobby')return fail(cb,'Game already started. Rejoin using your saved session.');if(g.players.length>=6)return fail(cb,'Room is full');const t=token(),p=makePlayer(name,t);g.players.push(p);bind(socket,g,p);cb?.({ok:true,code:id,token:t})});
 socket.on('resume',({code:raw,token:t}={},cb)=>{const g=rooms.get(String(raw||'').toUpperCase()),p=g?.players.find(p=>p.token===t);if(!p)return fail(cb,'Session not found (the server may have restarted)');bind(socket,g,p);cb?.({ok:true,code:g.code,token:t})});
 socket.on('start',(_,cb)=>action(socket,cb,(g,i)=>{if(i!==0||g.phase!=='lobby')throw Error('Only host can start');if(g.players.length<3)throw Error('Need at least 3 players');if(g.players.some(p=>!p.connected))throw Error('Wait for disconnected players');startRound(g)}));
 socket.on('trump',(s,cb)=>action(socket,cb,(g,i)=>{if(g.phase!=='chooseTrump'||i!==g.dealer||!SUITS.includes(s))throw Error('Dealer must choose trump');g.trump=s;g.phase='bid';g.turn=(g.dealer+1)%g.players.length;g.revision++}));
 socket.on('bid',(n,cb)=>action(socket,cb,(g,i)=>bid(g,i,n)));
 socket.on('play',(id,cb)=>action(socket,cb,(g,i)=>{play(g,i,id);if(g.phase==='trickEnd'){const revision=g.revision;setTimeout(()=>{if(g.phase==='trickEnd'&&g.revision===revision){finishTrick(g);publish(g)}},2600)}}));
 socket.on('ackTrick',(_,cb)=>action(socket,cb,(g,i)=>{if(i!==0||g.phase!=='trickEnd')throw Error('Not ready');finishTrick(g)}));
 socket.on('next',(_,cb)=>action(socket,cb,(g,i)=>{if(i!==0||g.phase!=='roundEnd')throw Error('Only host can start next round');startRound(g)}));
 socket.on('leave',(_,cb)=>action(socket,cb,(g,i)=>{if(g.phase!=='lobby')throw Error('Cannot leave a running game');g.players.splice(i,1);socket.data.code=null;socket.data.token=null;socket.leave(g.code);if(!g.players.length)rooms.delete(g.code)}));
 socket.on('disconnect',()=>{const g=rooms.get(socket.data.code),p=g?.players.find(p=>p.token===socket.data.token);if(p&&p.socketId===socket.id){p.connected=false;p.socketId=null;publish(g)}});
});
setInterval(()=>{for(const [id,g] of rooms){if(Date.now()-(g.updatedAt||Date.now())>ROOM_TTL)rooms.delete(id)}},60_000).unref();
server.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log(`Wizard Arcana ready on ${process.env.PORT||3000}`));
