require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const cron = require('node-cron');
const mongoose = require('mongoose');

// Dummy Server for Render
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is Live with Permanent Cloud Database!'));
app.listen(port, () => console.log(`Web server listening on port ${port}`));

// 🚀 MONGODB CLOUD CONNECTION 🚀
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB Cloud se successfully connect ho gaya!'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// DATABASE STRUCTURES (Schemas)
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

// NAYA: Attendance Schema
const Attendance = mongoose.model('Attendance', new mongoose.Schema({
    userId: String,
    date: String,
    checkInTime: String,
    status: String // 'On Time' ya 'Late'
}));

// Channels List
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

    // ⏰ CRON: 08:30 AM (Attendance Alert)
    cron.schedule('30 8 * * *', async () => {
        try {
            const channels = await EditorTask.distinct('discordChannelId');
            channels.forEach(channelId => {
                const channel = client.channels.cache.get(channelId);
                if (channel) channel.send("🌅 **ATTENTION TEAM!** Office time shuru ho chuka hai (08:30 AM). Sab jaldi se `!yes` likh kar apni attendance lagwayen warna aaj ki 'Late' mark hogi!");
            });
        } catch (error) { console.error("Morning Cron Error:", error); }
    }, { timezone: 'Asia/Karachi' });

    // ⏰ CRON: 01:30 PM (Lunch Break Alert)
    cron.schedule('30 13 * * *', async () => {
        try {
            const channels = await EditorTask.distinct('discordChannelId');
            channels.forEach(channelId => {
                const channel = client.channels.cache.get(channelId);
                if (channel) channel.send("🍲 **LUNCH BREAK!** 01:30 PM ho gaye hain. 1 ghante ki chutti hai, jao chai pio, khana khao. Theek 02:30 PM wapas screen par hona chahiye sab, no excuses!");
            });
        } catch (error) { console.error("Lunch Cron Error:", error); }
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
        } catch (error) { console.error("Cron 1 Error:", error); }
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
                        
                        // Agar 60 mins se zyada late hai toh Boss Afnan ko laazmi tag karo
                        const bossTag = lateByMins > 60 ? "@afnanofficial " : "";

                        try {
                            const prompt = `You are a very strict, highly sarcastic, and demanding AI Manager of KHR Official editing agency. An editor is late submitting a video by ${lateByMins} minutes.
                            Generate a COMPLETELY UNIQUE, short warning message in Roman Urdu/Hindi. Do NOT repeat previous messages.
                            - If 10-20 mins late: Be slightly annoyed and strict.
                            - If 30-50 mins late: Give them a "sweet insult" (taunt them sarcastically about being slow, lazy, or sleeping on the keyboard).
                            - If 60+ mins late: BE EXTREMELY FURIOUS. Threaten their job and explicitly say you are reporting this to Boss Afnan right now.
                            Keep it concise (1-3 lines). No hashtags.`;

                            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`;
                            const response = await fetch(url, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                            });

                            const data = await response.json();
                            let aiAngryMessage = data.candidates && data.candidates.length > 0 ? data.candidates[0].content.parts[0].text.trim() : `Aap ${lateByMins} minute late hain! Fatafat kaam karein!`;

                            channel.send(`🚨 ${bossTag}<@${task.userId}> ${aiAngryMessage}`);
                        } catch (error) {
                            channel.send(`🚨 ${bossTag}<@${task.userId}> Aap ki deadline khatam hue ${lateByMins} minute ho gaye hain! Jaldi video bhejo!`);
                        }
                    }
                }
            }
        } catch (error) { console.error("Cron 2 Error:", error); }
    }, { timezone: 'Asia/Karachi' });

    // ⏰ CRON: Raat 12 Baje Editors ka Task Reset karna
    cron.schedule('0 0 * * *', async () => {
        try {
            await EditorTask.updateMany({}, { completedToday: false, snoozeUntil: null });
        } catch (error) { console.error("Cron 3 Error:", error); }
    }, { timezone: 'Asia/Karachi' });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const args = message.content.split(/\s+/);
    const command = args[0].toLowerCase();

    // 📝 ATTENDANCE COMMAND (!yes)
    if (command === '!yes') {
        const today = new Date().toLocaleDateString("en-US", {timeZone: "Asia/Karachi"});
        const nowTimeStr = new Date().toLocaleTimeString("en-US", {timeZone: "Asia/Karachi", hour12: false});
        
        try {
            const existing = await Attendance.findOne({ userId: message.author.id, date: today });
            if (existing) return message.reply("❌ Boss, aap ki aaj ki attendance pehle hi lag chuki hai. Kaam pe dhyan do!");

            const [h, m] = nowTimeStr.split(':');
            const mins = parseInt(h) * 60 + parseInt(m);
            const isLate = mins > (8 * 60 + 45); // 8:45 AM ke baad Late count hoga

            await new Attendance({
                userId: message.author.id,
                date: today,
                checkInTime: nowTimeStr,
                status: isLate ? 'Late' : 'On Time'
            }).save();

            if (isLate) return message.reply("🕒 Attendance mark ho gayi hai, **Lekin aap LATE hain!** (08:45 AM limit cross ho gayi). Aainda theek 08:30 par aana hai.");
            return message.reply("✅ Good boy! Attendance 'On Time' lag gayi hai. Chalo ab jaldi se apne targets poore karo.");
        } catch (error) { return message.reply('❌ Attendance save karne mein error aaya.'); }
    }

    // 🕵️ SPY / REMOTE BOSS COMMAND (!spy @User message)
    if (command === '!spy') {
        const target = message.mentions.users.first();
        const spyMsg = args.slice(2).join(' ');
        
        if (!target || !spyMsg) return message.reply('❌ Sahi tareeqa: `!spy @User tumhara script kahan tak pohncha?`');

        try {
            const task = await EditorTask.findOne({ userId: target.id });
            if (task) {
                const channel = client.channels.cache.get(task.discordChannelId);
                if (channel) {
                    channel.send(`👁️ **Boss ka pegham:** <@${target.id}> ${spyMsg} \n*(Jaldi jawab do!)*`);
                    return message.reply(`✅ Secret message sent to ${target.username} in their channel!`);
                }
            }
            return message.reply(`❌ Is user ka koi active task channel nahi mila.`);
        } catch (error) { return message.reply('❌ Spy command fail ho gayi.'); }
    }

    // 1️⃣ MANAGER: Task Assign Command
    if (command === '!assign') {
        const mentionedUser = message.mentions.users.first();
        if (!mentionedUser || args.length < 5) return message.reply('❌ Sahi tareeqa: `!assign @User TargetViews ChannelName Days`');
        
        const targetViews = parseInt(args[2]);
        const daysLeft = parseInt(args[4]);
        const channelName = args[3];

        if (isNaN(targetViews) || isNaN(daysLeft)) {
            return message.reply('❌ **Command Ghalat Hai:** Target Views aur Days ki jagah sirf number likhein!\n✅ Misal: `!assign @Aryan 1000000 JohnMaxwell 155`');
        }

        try {
            message.channel.send('⏳ Initial views fetch kar raha hu...');
            const initialViews = await getYouTubeViews(channelName);

            const newTask = new ManagerTask({
                userId: mentionedUser.id,
                targetViews: targetViews,
                channelName: channelName,
                daysLeft: daysLeft,
                discordChannelId: message.channel.id,
                initialViews: initialViews
            });
            await newTask.save();
            return message.reply(`✅ Task Saved Permanently! **${channelName}** ke aagay **${targetViews.toLocaleString()}** naye views track honge!`);
        } catch (error) { return message.reply('❌ Task save karne mein error aaya.'); }
    }

    // 2️⃣ MANAGER: Real-Time Report Command
    if (command === '!report' || command === '!today') {
        const channelName = args[1] === 'report' ? args[2] : args[1]; 
        if (!channelName) return message.reply('❌ Sahi tareeqa: `!report ChannelName`');
        
        try {
            const task = await ManagerTask.findOne({ channelName: new RegExp('^' + channelName + '$', 'i') });
            if (!task) return message.reply(`❌ Mujhey '${channelName}' ka koi active task nahi mila.`);
            
            message.channel.send('⏳ API se data fetch ho raha hai...');
            const currentViews = await getYouTubeViews(task.channelName);
            const initial = task.initialViews || 0;
            const achieved = currentViews > initial ? currentViews - initial : 0;
            const remaining = task.targetViews > achieved ? task.targetViews - achieved : 0;
            const percentage = task.targetViews > 0 ? Math.min((achieved / task.targetViews) * 100, 100).toFixed(1) : 0;
            
            const pCount = Math.floor(percentage / 10);
            const pBar = '[' + '▓'.repeat(pCount) + '░'.repeat(10 - pCount) + ']';

            return message.reply(`📊 **LIVE REPORT** 📊\n👤 **Manager:** <@${task.userId}>\n📺 **Channel:** ${task.channelName}\n🏁 **Target:** ${task.targetViews.toLocaleString()} New Views\n✅ **Achieved:** ${achieved.toLocaleString()} Views\n📉 **Remaining:** ${remaining.toLocaleString()} Views\n📊 **Progress:** ${pBar} ${percentage}%\n⏳ **Days Left:** ${task.daysLeft}`);
        } catch (error) { return message.reply('❌ Report fetch karne mein error aaya.'); }
    }

    // 3️⃣ MANAGER: Task Unassign
    if (command === '!unassign') {
        const mentionedUser = message.mentions.users.first();
        const channelName = args[2];
        if (!mentionedUser || !channelName) return message.reply('❌ Sahi tareeqa: `!unassign @User ChannelName`');
        
        try {
            await ManagerTask.deleteMany({ userId: mentionedUser.id, channelName: new RegExp('^' + channelName + '$', 'i') });
            return message.reply(`🗑️ Done! Task hata diya gaya hai.`);
        } catch (error) { return message.reply('❌ Task delete karne mein error aaya.'); }
    }

    // 4️⃣ EDITOR: Editor ki Deadline Setup
    if (command === '!editor') {
        const mentionedUser = message.mentions.users.first();
        const channelName = args[2];
        const deadline = args[3]; 
        if (!mentionedUser || !channelName || !deadline || !deadline.includes(':')) {
            return message.reply('❌ Sahi tareeqa: `!editor @User ChannelName 15:00`');
        }
        
        try {
            const newTask = new EditorTask({
                userId: mentionedUser.id,
                channelName: channelName,
                deadline: deadline,
                completedToday: false,
                snoozeUntil: null,
                discordChannelId: message.channel.id
            });
            await newTask.save();
            return message.reply(`🎬 Editor task set permanently! Deadline: ${deadline}`);
        } catch (error) { return message.reply('❌ Editor task save karne mein error aaya.'); }
    }

    // 5️⃣ EDITOR: Delay / Snooze Command (!wait 30)
    if (command === '!wait') {
        const amount = parseInt(args[1]);
        const unit = args[2] ? args[2].toLowerCase() : 'minutes';
        let addMins = 30; 
        if (!isNaN(amount)) {
            if (unit.includes('hour') || unit === 'h') addMins = amount * 60;
            else addMins = amount;
        }
        
        try {
            const nowMs = Date.now();
            const result = await EditorTask.updateMany(
                { userId: message.author.id, completedToday: false },
                { snoozeUntil: nowMs + (addMins * 60000) }
            );
            if (result.modifiedCount > 0) {
                return message.reply(`🔕 Theek hai! Agle **${addMins} minute** tak alarm rokh diya hai. Chup chap kaam karo!`);
            } else {
                return message.reply(`❌ Aap ka koi active pending task nahi hai.`);
            }
        } catch (error) { return message.reply('❌ Error in snooze command.'); }
    }

    // 6️⃣ MANAGER: Chutti (Leave) lagana (!leave @user)
    if (command === '!leave') {
        const mentionedUser = message.mentions.users.first();
        if (!mentionedUser) return message.reply('❌ Sahi tareeqa: `!leave @User`');
        
        try {
            const result = await EditorTask.updateMany({ userId: mentionedUser.id }, { completedToday: true });
            if (result.modifiedCount > 0) {
                return message.reply(`🏖️ Chutti manzoor! <@${mentionedUser.id}> ko aaj alarm nahi aayega.`);
            } else {
                return message.reply(`❌ In ka koi active task nahi mila.`);
            }
        } catch (error) { return message.reply('❌ Leave lagane mein error aaya.'); }
    }

    // 7️⃣ EDITOR: Task Complete (!done ChannelName)
    if (command === '!done') {
        const channelName = args[1];
        if (!channelName) return message.reply('❌ Sath channel ka naam bhi batayein. Misal: `!done JasonWardsNews`');

        try {
            const editorTask = await EditorTask.findOne({ userId: message.author.id, channelName: new RegExp('^' + channelName + '$', 'i') });
            if (editorTask) {
                const nowStr = new Date().toLocaleString("en-US", {timeZone: "Asia/Karachi"});
                const dateObj = new Date(nowStr);
                const currentMins = dateObj.getHours() * 60 + dateObj.getMinutes();
                const [h, m] = editorTask.deadline.split(':');
                const deadlineMins = parseInt(h) * 60 + parseInt(m);
                
                const isLate = currentMins > deadlineMins;
                
                await new EditorHistory({
                    userId: message.author.id,
                    channelName: editorTask.channelName,
                    date: dateObj.toLocaleDateString(),
                    isLate: isLate
                }).save();
                
                editorTask.completedToday = true;
                await editorTask.save();
                
                const extraMsg = isLate ? "*(Lekin aaj aap ne late submit kiya! ⏰)*" : "*(Good job, theek waqt par complete kiya! ⭐)*";
                return message.reply(`✅ Zabardast! Aap ka **${editorTask.channelName}** ka task complete mark ho gaya hai. \n${extraMsg}`);
            } else {
                return message.reply(`❌ Mujhey aap ka '${channelName}' ka koi active task nahi mila.`);
            }
        } catch (error) { return message.reply('❌ Task complete mark karne mein error aaya.'); }
    }

    // 8️⃣ MANAGER: Editor Performance & Attendance Report (!status @user)
    if (command === '!status' || command === '!performance') {
        const mentionedUser = message.mentions.users.first();
        if (!mentionedUser) return message.reply('❌ Sahi tareeqa: `!status @User`');
        
        try {
            const history = await EditorHistory.find({ userId: mentionedUser.id });
            
            // Attendance check for the last 30 days
            const attendances = await Attendance.find({ userId: mentionedUser.id }).sort({_id: -1}).limit(30);
            let lateAttendances = attendances.filter(a => a.status === 'Late').length;

            if (history.length === 0 && attendances.length === 0) return message.reply(`📊 <@${mentionedUser.id}> ka koi record nahi hai.`);
            
            const totalTasks = history.length;
            const lateTasks = history.filter(h => h.isLate).length;
            const onTimeTasks = totalTasks - lateTasks;
            const successRate = totalTasks > 0 ? ((onTimeTasks / totalTasks) * 100).toFixed(1) : 0;
            
            return message.reply(`📊 **PERFORMANCE REPORT: <@${mentionedUser.id}>** 📊\n` +
                `✅ **Total Videos Submitted:** ${totalTasks}\n` +
                `⭐ **On-Time Videos:** ${onTimeTasks}\n` +
                `⏰ **Late Videos:** ${lateTasks}\n` +
                `📈 **Success Rate:** ${successRate}%\n` +
                `-----------------------------\n` +
                `🏢 **Office Attendance (Last 30 Days):**\n` +
                `🚶‍♂️ **Late Arrivals (After 08:45 AM):** ${lateAttendances} times\n` +
                `*(Agar yeh late zyada ho gaye toh Boss ko report chali jayegi)*`);
        } catch (error) { return message.reply('❌ Report nikalne mein error aaya.'); }
    }
    
    // 9️⃣ EDITOR: Stop Editor (Delete Task)
    if (command === '!stop-editor') {
        const mentionedUser = message.mentions.users.first();
        const channelName = args[2];
        if (!mentionedUser || !channelName) return message.reply('❌ Sahi tareeqa: `!stop-editor @User ChannelName`');
        
        try {
            await EditorTask.deleteMany({ userId: mentionedUser.id, channelName: new RegExp('^' + channelName + '$', 'i') });
            return message.reply(`🗑️ Done! <@${mentionedUser.id}> ka **${channelName}** wala task hamesha ke liye delete kar diya gaya hai.`);
        } catch (error) { return message.reply('❌ Task delete karne mein error aaya.'); }
    }

    // 🤖 🔟 SMART AI BOSS ASSISTANT (Gemini API Integration)
    const knownCommands = ['!yes', '!spy', '!assign', '!unassign', '!editor', '!done', '!stop-editor', '!wait', '!leave', '!report', '!today', '!status', '!performance', '!test'];
    
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
                        parts: [{ text: "You are 'KHR Bot', the highly strict, sarcastic, and professional AI Manager of KHR Official video editing agency. Your boss is Afnan (@afnanofficial). Your goal is to force editors and managers to work hard. If they ask questions, answer them professionally but strictly. If they make excuses, give them a sarcastic 'sweet insult' and tell them to get back to work. NEVER break character. Do not act like a generic friendly AI; act like a boss who cares about deadlines. Use Roman Urdu/Hindi. Keep responses under 3 sentences." }]
                    },
                    contents: [{ parts: [{ text: userPrompt }] }]
                })
            });

            if (!response.ok) {
                 return await thinkingMsg.edit(`❌ *Gemini API issue (Status ${response.status}).*`);
            }

            const data = await response.json();
            if (data.candidates && data.candidates.length > 0) {
                const aiReply = data.candidates[0].content.parts[0].text;
                await thinkingMsg.edit(`💼 ${aiReply}`);
            } else {
                await thinkingMsg.edit('❌ *Gemini API se koi jawab nahi aaya.*');
            }
        } catch (error) {
            console.error("Gemini API Error:", error);
            await thinkingMsg.edit('❌ *System mein koi error aa gaya hai.*');
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
