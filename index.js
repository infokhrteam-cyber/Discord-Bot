require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const cron = require('node-cron');
const mongoose = require('mongoose');

// Dummy Server for Render
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is Live with Permanent Cloud Database & AI Manager!'));
app.listen(port, () => console.log(`Web server listening on port ${port}`));

// 🚀 MONGODB CLOUD CONNECTION 🚀
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB Cloud se successfully connect ho gaya!'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// DATABASE STRUCTURES (Schemas)
const SystemSettings = mongoose.model('SystemSettings', new mongoose.Schema({
    key: String,
    value: String
}));

const ManagerTask = mongoose.model('ManagerTask', new mongoose.Schema({
    userId: String,
    targetViews: Number,
    channelName: String,
    daysLeft: Number,
    discordChannelId: String,
    initialViews: Number
}));

const EditorTask = mongoose.model('EditorTask', new mongoose.Schema({
    userId: String,
    channelName: String,
    deadline: String,
    completedToday: { type: Boolean, default: false },
    snoozeUntil: { type: Number, default: null },
    discordChannelId: String
}));

const EditorHistory = mongoose.model('EditorHistory', new mongoose.Schema({
    userId: String,
    channelName: String,
    date: String,
    isLate: Boolean
}));

const Attendance = mongoose.model('Attendance', new mongoose.Schema({
    userId: String,
    date: String,
    checkInTime: String,
    status: String
}));

// Helper Functions for Settings
async function getSetting(key) {
    const s = await SystemSettings.findOne({ key });
    return s ? s.value : null;
}
async function setSetting(key, value) {
    await SystemSettings.findOneAndUpdate({ key }, { value }, { upsert: true });
}

// Channels List (For YouTube Views)
const CHANNEL_IDS = {
    "JasonWardsNews": "UC_dnR2HAW79WcrTamOwPNSA", 
    "TomKingstone": "UC-3FmfNqJINtLY_Vk9nRNRg",
    "JohnMaxwell": "UCvuPGgIkXXEpKMLO-4B1NrA"
};

async function getYouTubeViews(channelName) {
    const channelId = CHANNEL_IDS[channelName];
    if (!channelId) return 0;
    try {
        const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${process.env.YOUTUBE_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.items && data.items.length > 0) return parseInt(data.items[0].statistics.viewCount);
    } catch (error) { console.error("YouTube Error:", error); }
    return 0;
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// BOSS CHECK FUNCTION
function isBoss(user) {
    return user.username.toLowerCase() === 'afnanofficial';
}

client.once('ready', () => {
    console.log(`✅ Boss Bot is online as ${client.user.tag}!`);

    // ⏰ CRON: 08:30 AM (Attendance Alert)
    cron.schedule('30 8 * * *', async () => {
        try {
            const officeChannelId = await getSetting('officeChannel');
            if (officeChannelId) {
                const channel = client.channels.cache.get(officeChannelId);
                if (channel) channel.send("🌅 **ATTENTION TEAM!** Office time shuru ho chuka hai (08:30 AM). Sab jaldi se `!yes` likh kar apni attendance lagwayen warna aaj ki 'Late' mark hogi aur Boss Afnan ko report jayegi!");
            }
        } catch (e) {}
    }, { timezone: 'Asia/Karachi' });

    // ⏰ CRON: 01:30 PM (Lunch Break Alert)
    cron.schedule('30 13 * * *', async () => {
        try {
            const officeChannelId = await getSetting('officeChannel');
            if (officeChannelId) {
                const channel = client.channels.cache.get(officeChannelId);
                if (channel) channel.send("🍲 **LUNCH BREAK!** 01:30 PM ho gaye hain. 1 ghante ki chutti hai, jao chai pio, khana khao. Theek 02:30 PM wapas screen par hona chahiye sab, no excuses!");
            }
        } catch (e) {}
    }, { timezone: 'Asia/Karachi' });

    // ⏰ CRON: Raat 12 Baje Manager ki Daily Report
    cron.schedule('0 0 * * *', async () => {
        try {
            const managerTasks = await ManagerTask.find();
            for (let task of managerTasks) {
                const currentViews = await getYouTubeViews(task.channelName);
                const initial = task.initialViews || 0;
                const achieved = currentViews > initial ? currentViews - initial : 0;
                const remaining = task.targetViews > achieved ? task.targetViews - achieved : 0;
                const percentage = task.targetViews > 0 ? Math.min((achieved / task.targetViews) * 100, 100).toFixed(1) : 0;
                
                const pCount = Math.floor(percentage / 10);
                const pBar = '[' + '▓'.repeat(pCount) + '░'.repeat(10 - pCount) + ']';

                task.daysLeft -= 1; 
                await task.save();
                
                const channel = client.channels.cache.get(task.discordChannelId);
                if (channel) {
                    channel.send(`📈 **DAILY REPORT (Raat 12 Baje)** 📈\n👤 <@${task.userId}>\n📺 **Channel:** ${task.channelName}\n🏁 **Target:** ${task.targetViews.toLocaleString()} New Views\n✅ **Achieved:** ${achieved.toLocaleString()} Views\n📉 **Remaining:** ${remaining.toLocaleString()} Views\n📊 **Progress:** ${pBar} ${percentage}%\n⏳ **Days Left:** ${task.daysLeft}`);
                }
            }
        } catch (e) {}
    }, { timezone: 'Asia/Karachi' });

    // ⏰ CRON: Har 10 Minute baad Editor ka Alarm Check (DYNAMIC ANGRY AI)
    cron.schedule('*/10 * * * *', async () => {
        try {
            const nowStr = new Date().toLocaleString("en-US", {timeZone: "Asia/Karachi"});
            const dateObj = new Date(nowStr);
            const currentMins = dateObj.getHours() * 60 + dateObj.getMinutes();
            const nowMs = Date.now();

            const editorTasks = await EditorTask.find();
            for (let task of editorTasks) {
                if (task.completedToday) continue; 
                if (task.snoozeUntil && nowMs < task.snoozeUntil) continue; 

                const [h, m] = task.deadline.split(':');
                const deadlineMins = parseInt(h) * 60 + parseInt(m);

                if (currentMins >= deadlineMins) {
                    const channel = client.channels.cache.get(task.discordChannelId);
                    if (channel) {
                        const lateByMins = currentMins - deadlineMins;
                        const bossTag = lateByMins >= 60 ? "<@afnanofficial> Boss, yeh check karein: " : "";

                        try {
                            const prompt = `You are an extremely strict, highly sarcastic, and bossy AI Manager. An editor is late submitting a video by ${lateByMins} minutes.
                            Generate a COMPLETELY UNIQUE, short warning message in Roman Urdu/Hindi. Do NOT repeat yourself.
                            - If 10-20 mins late: Be annoyed and strict.
                            - If 30-50 mins late: Sarcastic sweet insult (taunt their slowness).
                            - If 60+ mins late: FURIOUS. Threaten their job and mention reporting to Boss Afnan.
                            Keep it 1-2 lines. No hashtags.`;

                            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`;
                            const response = await fetch(url, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                            });

                            const data = await response.json();
                            let aiAngryMessage = data.candidates && data.candidates.length > 0 ? data.candidates[0].content.parts[0].text.trim() : `Aap ${lateByMins} minute late hain! Fatafat kaam karein!`;

                            // Channel Name is in brackets so AI can parse it later
                            channel.send(`🚨 ${bossTag}<@${task.userId}> **[${task.channelName}]** ${aiAngryMessage}`);
                        } catch (error) {
                            channel.send(`🚨 ${bossTag}<@${task.userId}> **[${task.channelName}]** Aap ki deadline khatam hue ${lateByMins} minute ho gaye hain! Jaldi video bhejo!`);
                        }
                    }
                }
            }
        } catch (e) {}
    }, { timezone: 'Asia/Karachi' });

    // ⏰ CRON: Raat 12 Baje Editors ka Task Reset karna
    cron.schedule('0 0 * * *', async () => {
        try { await EditorTask.updateMany({}, { completedToday: false, snoozeUntil: null }); } catch (e) {}
    }, { timezone: 'Asia/Karachi' });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // ==========================================
    // 🧠 SMART AI REPLY PARSER (Reply to Alert)
    // ==========================================
    if (message.reference && message.reference.messageId) {
        try {
            const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
            if (repliedMsg.author.id === client.user.id) {
                // Check if it's an alert message containing a [ChannelName]
                const match = repliedMsg.content.match(/\[(.*?)\]/);
                const channelName = match ? match[1] : null;

                if (channelName) {
                    const editorTask = await EditorTask.findOne({ userId: message.author.id, channelName: new RegExp('^' + channelName + '$', 'i') });
                    
                    if (editorTask && !editorTask.completedToday) {
                        const prompt = `The user replied to a deadline alert with: "${message.content}".
                        Analyze the intent.
                        1. If they mean the task is completed (done, ho gaya, bhej dia), output EXACTLY: ACTION_DONE
                        2. If they are asking for a short wait/snooze (e.g., give me 10 mins, wait 30 minutes, thori der), output EXACTLY: ACTION_SNOOZE_X (where X is the number of minutes).
                        3. If they are asking to EXTEND the deadline permanently or need a lot more time, output EXACTLY: ACTION_EXTEND
                        4. Otherwise, act as a strict sarcastic AI manager and tell them to stop talking and start working in Roman Urdu.`;

                        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`;
                        const response = await fetch(url, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                        });

                        const data = await response.json();
                        if (data.candidates && data.candidates.length > 0) {
                            const aiReply = data.candidates[0].content.parts[0].text.trim();

                            if (aiReply.includes('ACTION_DONE')) {
                                // Mark Done
                                editorTask.completedToday = true;
                                await editorTask.save();
                                return message.reply(`✅ Theek hai! Main ne **${channelName}** ko aakhri waqt par complete mark kar diya hai. Aainda waqt ka khayal rakhna!`);
                            
                            } else if (aiReply.includes('ACTION_SNOOZE_')) {
                                // Extract Minutes and Snooze
                                const minsMatch = aiReply.match(/\d+/);
                                const addMins = minsMatch ? parseInt(minsMatch[0]) : 30;
                                editorTask.snoozeUntil = Date.now() + (addMins * 60000);
                                await editorTask.save();
                                return message.reply(`🔕 Theek hai boss! Sirf **${addMins} minute** ka time de raha hu. Uske baad double gussa aayega!`);
                            
                            } else if (aiReply.includes('ACTION_EXTEND')) {
                                // Request Boss in Admin Channel
                                const adminChannelId = await getSetting('adminChannel');
                                if (adminChannelId) {
                                    const adminChannel = client.channels.cache.get(adminChannelId);
                                    if (adminChannel) {
                                        adminChannel.send(`⚠️ **BOSS ALERT:** <@${message.author.id}> apne **${channelName}** task ki deadline extend karwana chahta hai.\nUse \`!approve @User ${channelName} HH:MM\` to approve.`);
                                    }
                                }
                                return message.reply(`🛑 Meri authority nahi hai deadline badhane ki. Main ne Boss Afnan ko request bhej di hai, unki ijazat ka wait karein.`);
                            } else {
                                // AI Sarcastic Chat
                                return message.reply(`💼 ${aiReply}`);
                            }
                        }
                        return; // Stop further processing if it was an alert reply
                    }
                }
            }
        } catch (e) { console.error("Reply Parser Error:", e); }
    }

    const args = message.content.split(/\s+/);
    const command = args[0].toLowerCase();

    // ==========================================
    // 🏢 CHANNEL SETUP COMMANDS (Only for Boss)
    // ==========================================
    if (['!office', '!admin', '!spy'].includes(command) && args[1]?.toLowerCase() === 'boss') {
        if (!isBoss(message.author)) return message.reply("🚫 Aap mere boss nahi hain! Mere boss sirf Boss Afnan hain.");
        
        if (command === '!office') {
            await setSetting('officeChannel', message.channel.id);
            return message.reply("🏢 Attendance aur Lunch ke alerts ab is channel mein aayenge.");
        }
        if (command === '!admin') {
            await setSetting('adminChannel', message.channel.id);
            return message.reply("🔐 Boss! Deadline extensions ki requests ab is private channel mein aayengi.");
        }
        if (command === '!spy') {
            await setSetting('spyChannel', message.channel.id);
            return message.reply("🕵️‍♂️ Spy mode activated! Ab aap yahan se spy commands de sakte hain.");
        }
    }

    // 🕵️ SPY COMMAND EXECUTION (!spy @User message)
    if (command === '!spy' && args[1]?.toLowerCase() !== 'boss') {
        if (!isBoss(message.author)) return message.reply("🚫 Aap ko kis ne ijazat di spying karne ki? Yeh sirf Boss Afnan kar sakte hain!");
        const target = message.mentions.users.first();
        const spyMsg = args.slice(2).join(' ');
        
        if (!target || !spyMsg) return message.reply('❌ Sahi tareeqa: `!spy @User tumhara script kahan tak pohncha?`');

        try {
            const task = await EditorTask.findOne({ userId: target.id });
            if (task) {
                const channel = client.channels.cache.get(task.discordChannelId);
                if (channel) {
                    // Natural AI Phrasing
                    channel.send(`🤖 Oye <@${target.id}>, ${spyMsg}`);
                    return message.reply(`✅ Message secretly bheja gaya **${task.channelName}** channel mein.`);
                }
            }
            return message.reply(`❌ Is user ka koi active task channel nahi mila.`);
        } catch (error) { return message.reply('❌ Spy command fail ho gayi.'); }
    }

    // 📝 ATTENDANCE COMMAND (!yes)
    if (command === '!yes') {
        const today = new Date().toLocaleDateString("en-US", {timeZone: "Asia/Karachi"});
        const nowTimeStr = new Date().toLocaleTimeString("en-US", {timeZone: "Asia/Karachi", hour12: false});
        
        try {
            const existing = await Attendance.findOne({ userId: message.author.id, date: today });
            if (existing) return message.reply("❌ Boss, aap ki aaj ki attendance pehle hi lag chuki hai. Kaam pe dhyan do!");

            const [h, m] = nowTimeStr.split(':');
            const mins = parseInt(h) * 60 + parseInt(m);
            const isLate = mins > (8 * 60 + 45); // 8:45 AM limit

            await new Attendance({ userId: message.author.id, date: today, checkInTime: nowTimeStr, status: isLate ? 'Late' : 'On Time' }).save();

            if (isLate) return message.reply("🕒 Attendance mark ho gayi hai, **Lekin aap LATE hain!** (08:45 AM limit cross ho gayi).");
            return message.reply("✅ Good boy! Attendance 'On Time' lag gayi hai.");
        } catch (error) { return message.reply('❌ Attendance save error.'); }
    }

    // ✅ EXTENSION APPROVAL (!approve @user Channel HH:MM) (Only Boss)
    if (command === '!approve') {
        if (!isBoss(message.author)) return message.reply("🚫 Sirf Boss Afnan deadline extend kar sakte hain.");
        const mentionedUser = message.mentions.users.first();
        const channelName = args[2];
        const newDeadline = args[3];

        if (!mentionedUser || !channelName || !newDeadline) return message.reply('❌ Sahi tareeqa: `!approve @User ChannelName 18:30`');

        const task = await EditorTask.findOne({ userId: mentionedUser.id, channelName: new RegExp('^' + channelName + '$', 'i') });
        if (task) {
            task.deadline = newDeadline;
            task.snoozeUntil = null; // Clear any snooze
            await task.save();
            const workChannel = client.channels.cache.get(task.discordChannelId);
            if (workChannel) workChannel.send(`🎉 <@${mentionedUser.id}> Boss Afnan ne aap ki guzarish sun li hai! Nayi deadline **${newDeadline}** set ho gayi hai. Ab koi bahana nahi!`);
            return message.reply(`✅ Nayi deadline set kar di gayi hai.`);
        } else {
            return message.reply('❌ Koi active task nahi mila.');
        }
    }

    // 1️⃣ MANAGER: Task Assign Command (Only Boss)
    if (command === '!assign') {
        if (!isBoss(message.author)) return message.reply("🚫 Sirf Boss Afnan hi task assign kar sakte hain.");
        const mentionedUser = message.mentions.users.first();
        if (!mentionedUser || args.length < 5) return message.reply('❌ Sahi tareeqa: `!assign @User TargetViews ChannelName Days`');
        
        const targetViews = parseInt(args[2]);
        const daysLeft = parseInt(args[4]);
        const channelName = args[3];

        if (isNaN(targetViews) || isNaN(daysLeft)) return message.reply('❌ **Command Ghalat Hai:** Views/Days number mein likhein.');

        try {
            message.channel.send('⏳ Views fetch kar raha hu...');
            const initialViews = await getYouTubeViews(channelName);
            await new ManagerTask({ userId: mentionedUser.id, targetViews, channelName, daysLeft, discordChannelId: message.channel.id, initialViews }).save();
            return message.reply(`✅ Task Saved! **${channelName}** ke aagay **${targetViews.toLocaleString()}** naye views track honge!`);
        } catch (error) { return message.reply('❌ Error saving task.'); }
    }

    // 2️⃣ MANAGER: Real-Time Report Command
    if (command === '!report' || command === '!today') {
        const channelName = args[1] === 'report' ? args[2] : args[1]; 
        if (!channelName) return message.reply('❌ Sahi tareeqa: `!report ChannelName`');
        try {
            const task = await ManagerTask.findOne({ channelName: new RegExp('^' + channelName + '$', 'i') });
            if (!task) return message.reply(`❌ Mujhey '${channelName}' ka task nahi mila.`);
            message.channel.send('⏳ Fetching live views...');
            const currentViews = await getYouTubeViews(task.channelName);
            const initial = task.initialViews || 0;
            const achieved = currentViews > initial ? currentViews - initial : 0;
            const remaining = task.targetViews > achieved ? task.targetViews - achieved : 0;
            const percentage = task.targetViews > 0 ? Math.min((achieved / task.targetViews) * 100, 100).toFixed(1) : 0;
            const pBar = '[' + '▓'.repeat(Math.floor(percentage / 10)) + '░'.repeat(10 - Math.floor(percentage / 10)) + ']';
            return message.reply(`📊 **LIVE REPORT** 📊\n👤 **Manager:** <@${task.userId}>\n📺 **Channel:** ${task.channelName}\n🏁 **Target:** ${task.targetViews.toLocaleString()} Views\n✅ **Achieved:** ${achieved.toLocaleString()} Views\n📉 **Remaining:** ${remaining.toLocaleString()} Views\n📊 **Progress:** ${pBar} ${percentage}%\n⏳ **Days Left:** ${task.daysLeft}`);
        } catch (error) { return message.reply('❌ Error fetching report.'); }
    }

    // 3️⃣ MANAGER: Task Unassign (Only Boss)
    if (command === '!unassign') {
        if (!isBoss(message.author)) return;
        const mentionedUser = message.mentions.users.first();
        const channelName = args[2];
        if (!mentionedUser || !channelName) return message.reply('❌ Sahi tareeqa: `!unassign @User ChannelName`');
        await ManagerTask.deleteMany({ userId: mentionedUser.id, channelName: new RegExp('^' + channelName + '$', 'i') });
        return message.reply(`🗑️ Done! Task hata diya gaya hai.`);
    }

    // 4️⃣ EDITOR: Editor ki Deadline Setup (Only Boss)
    if (command === '!editor') {
        if (!isBoss(message.author)) return message.reply("🚫 Aap boss nahi hain!");
        const mentionedUser = message.mentions.users.first();
        const channelName = args[2];
        const deadline = args[3]; 
        if (!mentionedUser || !channelName || !deadline || !deadline.includes(':')) return message.reply('❌ Sahi tareeqa: `!editor @User ChannelName 15:00`');
        
        await new EditorTask({ userId: mentionedUser.id, channelName, deadline, discordChannelId: message.channel.id }).save();
        return message.reply(`🎬 Editor task set! Deadline: **${deadline}**`);
    }

    // 5️⃣ EDITOR: Manual Snooze (!wait 30)
    if (command === '!wait') {
        const amount = parseInt(args[1]);
        const unit = args[2] ? args[2].toLowerCase() : 'minutes';
        let addMins = 30; 
        if (!isNaN(amount)) addMins = (unit.includes('h') ? amount * 60 : amount);
        
        const result = await EditorTask.updateMany({ userId: message.author.id, completedToday: false }, { snoozeUntil: Date.now() + (addMins * 60000) });
        if (result.modifiedCount > 0) return message.reply(`🔕 Agle **${addMins} minute** alarm off kar diya hai. Fatafat kaam karo!`);
        else return message.reply(`❌ Aap ka koi active task nahi hai.`);
    }

    // 6️⃣ MANAGER: Leave (!leave @user) (Only Boss)
    if (command === '!leave') {
        if (!isBoss(message.author)) return;
        const mentionedUser = message.mentions.users.first();
        if (!mentionedUser) return message.reply('❌ Sahi tareeqa: `!leave @User`');
        await EditorTask.updateMany({ userId: mentionedUser.id }, { completedToday: true });
        return message.reply(`🏖️ <@${mentionedUser.id}> ki aaj ki chutti manzoor!`);
    }

    // 7️⃣ EDITOR: Manual Complete (!done ChannelName)
    if (command === '!done') {
        const channelName = args[1];
        if (!channelName) return message.reply('❌ Sath channel ka naam batayein ya mere alert ka reply karein.');
        const editorTask = await EditorTask.findOne({ userId: message.author.id, channelName: new RegExp('^' + channelName + '$', 'i') });

        if (editorTask) {
            const nowStr = new Date().toLocaleString("en-US", {timeZone: "Asia/Karachi"});
            const dateObj = new Date(nowStr);
            const currentMins = dateObj.getHours() * 60 + dateObj.getMinutes();
            const [h, m] = editorTask.deadline.split(':');
            const isLate = currentMins > (parseInt(h) * 60 + parseInt(m));
            
            await new EditorHistory({ userId: message.author.id, channelName: editorTask.channelName, date: dateObj.toLocaleDateString(), isLate }).save();
            editorTask.completedToday = true;
            await editorTask.save();
            
            const extraMsg = isLate ? "*(Lekin aaj aap late thay! ⏰)*" : "*(Good job, theek waqt par complete kiya! ⭐)*";
            return message.reply(`✅ **${editorTask.channelName}** done! \n${extraMsg}`);
        } else return message.reply(`❌ Mujhey '${channelName}' ka active task nahi mila.`);
    }

    // 8️⃣ MANAGER: Status / Performance Report
    if (command === '!status' || command === '!performance') {
        const mentionedUser = message.mentions.users.first();
        if (!mentionedUser) return message.reply('❌ Sahi tareeqa: `!status @User`');
        try {
            const history = await EditorHistory.find({ userId: mentionedUser.id });
            const attendances = await Attendance.find({ userId: mentionedUser.id }).sort({_id: -1}).limit(30);
            let lateAttendances = attendances.filter(a => a.status === 'Late').length;

            if (history.length === 0 && attendances.length === 0) return message.reply(`📊 <@${mentionedUser.id}> ka koi record nahi hai.`);
            
            const totalTasks = history.length;
            const lateTasks = history.filter(h => h.isLate).length;
            const onTimeTasks = totalTasks - lateTasks;
            const successRate = totalTasks > 0 ? ((onTimeTasks / totalTasks) * 100).toFixed(1) : 0;
            
            return message.reply(`📊 **PERFORMANCE REPORT: <@${mentionedUser.id}>** 📊\n` +
                `✅ **Total Videos:** ${totalTasks} | ⭐ **On-Time:** ${onTimeTasks} | ⏰ **Late Videos:** ${lateTasks}\n` +
                `📈 **Success Rate:** ${successRate}%\n-----------------------------\n` +
                `🏢 **Office Attendance (Last 30 Days):**\n` +
                `🚶‍♂️ **Late Arrivals (After 08:45 AM):** ${lateAttendances} times`);
        } catch (error) { return message.reply('❌ Report error.'); }
    }
    
    // 9️⃣ EDITOR: Stop Task (!stop-editor) (Only Boss)
    if (command === '!stop-editor') {
        if (!isBoss(message.author)) return;
        const mentionedUser = message.mentions.users.first();
        const channelName = args[2];
        if (!mentionedUser || !channelName) return message.reply('❌ `!stop-editor @User ChannelName`');
        await EditorTask.deleteMany({ userId: mentionedUser.id, channelName: new RegExp('^' + channelName + '$', 'i') });
        return message.reply(`🗑️ Task deleted!`);
    }

    // 🤖 🔟 SMART AI BOSS ASSISTANT (Chat)
    const knownCommands = ['!yes', '!approve', '!office', '!admin', '!spy', '!assign', '!unassign', '!editor', '!done', '!stop-editor', '!wait', '!leave', '!report', '!today', '!status', '!performance', '!test'];
    
    if (command.startsWith('!') && command.length > 1 && !command.startsWith('!<@') && !knownCommands.includes(command)) {
        const userPrompt = message.content.substring(1).trim(); 
        const thinkingMsg = await message.reply('🤖 *Boss mode on...*');

        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    system_instruction: {
                        parts: [{ text: "You are 'KHR Bot', the strict, sarcastic, and professional AI Manager of KHR Official editing agency. Your boss is Afnan (@afnanofficial). Your goal is to force editors to work hard. Give sarcastic 'sweet insults' to lazy editors. NEVER break character. Answer in Roman Urdu/Hindi. Keep responses under 3 sentences." }]
                    },
                    contents: [{ parts: [{ text: userPrompt }] }]
                })
            });

            const data = await response.json();
            if (data.candidates && data.candidates.length > 0) {
                const aiReply = data.candidates[0].content.parts[0].text;
                await thinkingMsg.edit(`💼 ${aiReply}`);
            } else await thinkingMsg.edit('❌ *API Issue.*');
        } catch (error) { await thinkingMsg.edit('❌ *System Error.*'); }
    }
});

client.login(process.env.DISCORD_TOKEN);
