require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const fs = require('fs');
const cron = require('node-cron');

// Dummy Server for Render
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is Live!'));
app.listen(port, () => console.log(`Web server listening on port ${port}`));

// Database Link
const tasksFile = './tasks.json';
let db = { managerTasks: [], editorTasks: [], editorHistory: [] };
if (fs.existsSync(tasksFile)) {
    const fileData = JSON.parse(fs.readFileSync(tasksFile));
    db = { ...db, ...fileData }; // Puranay database ko naye system ke sath merge karna
}
function saveDb() {
    fs.writeFileSync(tasksFile, JSON.stringify(db, null, 2));
}

// Channels List
const CHANNEL_IDS = {
    "JasonWardsNews": "UC_dnR2HAW79WcrTamOwPNSA", 
    "TomKingstone": "UC-3FmfNqJINtLY_Vk9nRNRg",
    "JohnMaxwell": "UCvuPGgIkXXEpKMLO-4B1NrA"
};

// YouTube Live Views Function
async function getYouTubeViews(channelName) {
    const channelId = CHANNEL_IDS[channelName];
    if (!channelId) return 0;
    try {
        const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${process.env.YOUTUBE_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.items && data.items.length > 0) return parseInt(data.items[0].statistics.viewCount);
    } catch (error) { 
        console.error("YouTube API Error:", error); 
    }
    return 0;
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.once('ready', () => {
    console.log(`✅ Zabardast! Bot is online as ${client.user.tag}!`);

    // ⏰ CRON 1: Raat 12 Baje Manager ki Daily Report
    cron.schedule('0 0 * * *', async () => {
        for (let task of db.managerTasks) {
            const currentViews = await getYouTubeViews(task.channelName);
            const initial = task.initialViews || 0;
            const achieved = currentViews > initial ? currentViews - initial : 0;
            const remaining = task.targetViews > achieved ? task.targetViews - achieved : 0;
            const percentage = task.targetViews > 0 ? Math.min((achieved / task.targetViews) * 100, 100).toFixed(1) : 0;
            
            // Progress Bar Generator
            const pCount = Math.floor(percentage / 10);
            const pBar = '[' + '▓'.repeat(pCount) + '░'.repeat(10 - pCount) + ']';

            task.daysLeft -= 1; 
            
            const channel = client.channels.cache.get(task.discordChannelId);
            if (channel) {
                channel.send(`📈 **DAILY REPORT (Raat 12 Baje)** 📈\n👤 <@${task.userId}>\n📺 **Channel:** ${task.channelName}\n🏁 **Target:** ${task.targetViews.toLocaleString()} New Views\n✅ **Achieved:** ${achieved.toLocaleString()} Views\n📉 **Remaining:** ${remaining.toLocaleString()} Views\n📊 **Progress:** ${pBar} ${percentage}%\n⏳ **Days Left:** ${task.daysLeft}`);
            }
        }
        saveDb();
    }, { timezone: 'Asia/Karachi' });

    // ⏰ CRON 2: Har 10 Minute baad Editor ka Alarm Check
    cron.schedule('*/10 * * * *', () => {
        const nowStr = new Date().toLocaleString("en-US", {timeZone: "Asia/Karachi"});
        const dateObj = new Date(nowStr);
        const currentMins = dateObj.getHours() * 60 + dateObj.getMinutes();
        const nowMs = Date.now();

        db.editorTasks.forEach(task => {
            if (task.completedToday) return; 
            if (task.snoozeUntil && nowMs < task.snoozeUntil) return; // Agar editor ne wait ka kaha hai toh ignore karo

            const [h, m] = task.deadline.split(':');
            const deadlineMins = parseInt(h) * 60 + parseInt(m);

            if (currentMins >= deadlineMins) {
                const channel = client.channels.cache.get(task.discordChannelId);
                if (channel) {
                    channel.send(`🚨 <@${task.userId}> Aaj ki deadline (${task.deadline}) khatam ho gayi hai! Jaldi video bhejo, ya phir thora time chahiye toh \`!wait 30\` likho!`);
                }
            }
        });
    }, { timezone: 'Asia/Karachi' });

    // ⏰ CRON 3: Raat 12 Baje Editors ka Task Reset karna (Naye din ke liye)
    cron.schedule('0 0 * * *', () => {
        db.editorTasks.forEach(task => {
            task.completedToday = false;
            task.snoozeUntil = null; // Snooze history reset
        });
        saveDb();
    }, { timezone: 'Asia/Karachi' });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const args = message.content.split(/\s+/);
    const command = args[0].toLowerCase();

    // 1️⃣ MANAGER: Task Assign Command (With Target Fix)
    if (command === '!assign') {
        const mentionedUser = message.mentions.users.first();
        if (!mentionedUser || args.length < 5) return message.reply('❌ Sahi tareeqa: `!assign @User TargetViews ChannelName Days`');
        
        message.channel.send('⏳ Initial views fetch kar raha hu taake naya target theek se track ho...');
        
        const initialViews = await getYouTubeViews(args[3]);

        const task = {
            userId: mentionedUser.id,
            targetViews: parseInt(args[2]),
            channelName: args[3],
            daysLeft: parseInt(args[4]),
            discordChannelId: message.channel.id,
            initialViews: initialViews
        };
        db.managerTasks.push(task);
        saveDb();
        message.reply(`✅ Task Saved! **${task.channelName}** ke aaj ke views (${initialViews.toLocaleString()}) save ho gaye hain. Ab inke aagay **${task.targetViews.toLocaleString()}** naye views track honge!`);
        return;
    }

    // 2️⃣ MANAGER: Real-Time Report Command (!report ChannelName)
    if (command === '!report' || command === '!today') {
        const channelName = args[1] === 'report' ? args[2] : args[1]; // Handle !report or !today report
        if (!channelName) return message.reply('❌ Sahi tareeqa: `!report ChannelName`');
        
        const task = db.managerTasks.find(t => t.channelName.toLowerCase() === channelName.toLowerCase());
        if (!task) return message.reply(`❌ Mujhey '${channelName}' ka koi active task nahi mila.`);
        
        message.channel.send('⏳ Live YouTube API se data fetch ho raha hai...');
        
        const currentViews = await getYouTubeViews(task.channelName);
        const initial = task.initialViews || 0;
        const achieved = currentViews > initial ? currentViews - initial : 0;
        const remaining = task.targetViews > achieved ? task.targetViews - achieved : 0;
        const percentage = task.targetViews > 0 ? Math.min((achieved / task.targetViews) * 100, 100).toFixed(1) : 0;
        
        const pCount = Math.floor(percentage / 10);
        const pBar = '[' + '▓'.repeat(pCount) + '░'.repeat(10 - pCount) + ']';

        return message.reply(`📊 **LIVE REPORT (On-Demand)** 📊\n👤 **Manager:** <@${task.userId}>\n📺 **Channel:** ${task.channelName}\n🏁 **Target:** ${task.targetViews.toLocaleString()} New Views\n✅ **Achieved:** ${achieved.toLocaleString()} Views\n📉 **Remaining:** ${remaining.toLocaleString()} Views\n📊 **Progress:** ${pBar} ${percentage}%\n⏳ **Days Left:** ${task.daysLeft}`);
    }

    // 3️⃣ MANAGER: Task Unassign
    if (command === '!unassign') {
        const mentionedUser = message.mentions.users.first();
        const channelName = args[2];
        if (!mentionedUser || !channelName) return message.reply('❌ Sahi tareeqa: `!unassign @User ChannelName`');
        db.managerTasks = db.managerTasks.filter(t => !(t.userId === mentionedUser.id && t.channelName.toLowerCase() === channelName.toLowerCase()));
        saveDb();
        return message.reply(`🗑️ Done! Task hata diya gaya hai.`);
    }

    // 4️⃣ EDITOR: Editor ki Deadline Setup
    if (command === '!editor') {
        const mentionedUser = message.mentions.users.first();
        const channelName = args[2];
        const deadline = args[3]; 
        if (!mentionedUser || !channelName || !deadline || !deadline.includes(':')) {
            return message.reply('❌ Sahi tareeqa: `!editor @User ChannelName 15:00` (24-Hour Format)');
        }
        db.editorTasks.push({
            userId: mentionedUser.id,
            channelName: channelName,
            deadline: deadline,
            completedToday: false,
            snoozeUntil: null,
            discordChannelId: message.channel.id
        });
        saveDb();
        return message.reply(`🎬 Editor task set! Agar ${deadline} tak video na aayi, toh har 10 minute baad alarm baje ga.`);
    }

    // 5️⃣ EDITOR: Delay / Snooze Command (!wait 30)
    if (command === '!wait') {
        const amount = parseInt(args[1]);
        const unit = args[2] ? args[2].toLowerCase() : 'minutes';
        let addMins = 30; // Default snooze
        
        if (!isNaN(amount)) {
            if (unit.includes('hour') || unit === 'h') addMins = amount * 60;
            else addMins = amount;
        }
        
        const nowMs = Date.now();
        let updated = false;
        
        db.editorTasks.forEach(t => {
            if (t.userId === message.author.id && !t.completedToday) {
                t.snoozeUntil = nowMs + (addMins * 60000);
                updated = true;
            }
        });
        
        if (updated) {
            saveDb();
            return message.reply(`🔕 Theek hai boss! Main agle **${addMins} minute** tak alarm nahi bajaunga. Aaram se edit kar lein!`);
        } else {
            return message.reply(`❌ Aap ka koi active pending task nahi hai jise main delay karu.`);
        }
    }

    // 6️⃣ MANAGER: Chutti (Leave) lagana (!leave @user)
    if (command === '!leave') {
        const mentionedUser = message.mentions.users.first();
        if (!mentionedUser) return message.reply('❌ Sahi tareeqa: `!leave @User`');
        
        let found = false;
        db.editorTasks.forEach(t => {
            if (t.userId === mentionedUser.id) {
                t.completedToday = true;
                found = true;
            }
        });
        
        if (found) {
            saveDb();
            return message.reply(`🏖️ Chutti manzoor! <@${mentionedUser.id}> ko aaj koi editor alarm nahi aayega.`);
        } else {
            return message.reply(`❌ In ka koi active task nahi mila.`);
        }
    }

    // 7️⃣ EDITOR: Task Complete (!done ChannelName)
    if (command === '!done') {
        const channelName = args[1];
        if (!channelName) return message.reply('❌ Sath channel ka naam bhi batayein. Misal: `!done JasonWardsNews`');

        const editorTask = db.editorTasks.find(t => t.userId === message.author.id && t.channelName.toLowerCase() === channelName.toLowerCase());

        if (editorTask) {
            // Check performance history (was it late?)
            const nowStr = new Date().toLocaleString("en-US", {timeZone: "Asia/Karachi"});
            const dateObj = new Date(nowStr);
            const currentMins = dateObj.getHours() * 60 + dateObj.getMinutes();
            const [h, m] = editorTask.deadline.split(':');
            const deadlineMins = parseInt(h) * 60 + parseInt(m);
            
            const isLate = currentMins > deadlineMins;
            
            // Save to history
            if (!db.editorHistory) db.editorHistory = [];
            db.editorHistory.push({
                userId: message.author.id,
                channelName: editorTask.channelName,
                date: dateObj.toLocaleDateString(),
                isLate: isLate
            });
            // Keep history light (max 1000 records)
            if (db.editorHistory.length > 1000) db.editorHistory.shift();
            
            editorTask.completedToday = true;
            saveDb();
            
            const extraMsg = isLate ? "*(Lekin aaj aap late thay! ⏰)*" : "*(Good job, waqt par kaam poora kiya! ⭐)*";
            return message.reply(`✅ Zabardast! Aap ka **${editorTask.channelName}** ka task complete mark ho gaya hai. Alarm off! 🔕\n${extraMsg}`);
        } else {
            return message.reply(`❌ Mujhey aap ka '${channelName}' ka koi active task nahi mila. Spelling check karein.`);
        }
    }

    // 8️⃣ MANAGER: Editor Performance Report (!status @user)
    if (command === '!status' || command === '!performance') {
        const mentionedUser = message.mentions.users.first();
        if (!mentionedUser) return message.reply('❌ Sahi tareeqa: `!status @User`');
        
        const history = (db.editorHistory || []).filter(h => h.userId === mentionedUser.id);
        if (history.length === 0) return message.reply(`📊 <@${mentionedUser.id}> ka abhi tak koi record (history) nahi hai.`);
        
        const totalTasks = history.length;
        const lateTasks = history.filter(h => h.isLate).length;
        const onTimeTasks = totalTasks - lateTasks;
        const successRate = ((onTimeTasks / totalTasks) * 100).toFixed(1);
        
        return message.reply(`📊 **PERFORMANCE REPORT: <@${mentionedUser.id}>** 📊\n` +
                      `✅ **Total Videos Submitted:** ${totalTasks}\n` +
                      `⭐ **On-Time Submissions:** ${onTimeTasks}\n` +
                      `⏰ **Late Submissions:** ${lateTasks}\n` +
                      `📈 **Success Rate:** ${successRate}%\n` +
                      `*(Yeh un ki pichli tamaam editing submissions ka record hai)*`);
    }
    
    // 9️⃣ EDITOR: Stop Editor (Delete Task)
    if (command === '!stop-editor') {
        const mentionedUser = message.mentions.users.first();
        const channelName = args[2];
        if (!mentionedUser || !channelName) return message.reply('❌ Sahi tareeqa: `!stop-editor @User ChannelName`');
        db.editorTasks = db.editorTasks.filter(t => !(t.userId === mentionedUser.id && t.channelName.toLowerCase() === channelName.toLowerCase()));
        saveDb();
        return message.reply(`🗑️ Done! <@${mentionedUser.id}> ka **${channelName}** wala task hamesha ke liye delete kar diya gaya hai.`);
    }

    // 🤖 🔟 SMART AI ASSISTANT (Gemini API Integration)
    const knownCommands = ['!assign', '!unassign', '!editor', '!done', '!stop-editor', '!wait', '!leave', '!report', '!today', '!status', '!performance', '!test'];
    
    // Agar message '!' se shuru ho, command na ho, aur kisi user ko tag na kiya ho
    if (command.startsWith('!') && command.length > 1 && !command.startsWith('!<@') && !knownCommands.includes(command)) {
        
        // '!' ko hata kar user ka sawal nikalna
        const userPrompt = message.content.substring(1).trim(); 
        
        // Bot pehle "Soch raha hu" ka message bheje ga
        const thinkingMsg = await message.reply('🤖 *Soch raha hu...*');

        try {
            // Gemini API (1.5 Flash) ko request bhejna
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    system_instruction: {
                        parts: [{ text: "You are a highly intelligent, professional, and friendly AI assistant for a video editing agency named KHR Official. You answer editing questions, general queries, and chat like a real person. Mostly use Roman Urdu/Hindi to reply. Keep responses concise and formatted nicely for Discord." }]
                    },
                    contents: [{
                        parts: [{ text: userPrompt }]
                    }]
                })
            });

            const data = await response.json();

            if (data.candidates && data.candidates.length > 0) {
                const aiReply = data.candidates[0].content.parts[0].text;
                // Puranay "Soch raha hu" wale message ko real answer se edit kar dena
                await thinkingMsg.edit(`🤖 ${aiReply}`);
            } else {
                await thinkingMsg.edit('❌ *Gemini API se koi jawab nahi aaya. Apni API key ya Render par Environment Variable check karein.*');
            }

        } catch (error) {
            console.error("Gemini API Error:", error);
            await thinkingMsg.edit('❌ *System mein koi error aa gaya hai. Baad mein try karein.*');
        }
    }
});

client.login(process.env.DISCORD_TOKEN);

client.login(process.env.DISCORD_TOKEN);
