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
let db = { managerTasks: [], editorTasks: [] };
if (fs.existsSync(tasksFile)) {
    db = JSON.parse(fs.readFileSync(tasksFile));
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
    } catch (error) { console.error(error); }
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
            const remaining = task.targetViews > currentViews ? task.targetViews - currentViews : 0;
            task.daysLeft -= 1; // Ek din kam kar diya
            
            const channel = client.channels.cache.get(task.discordChannelId);
            if (channel) {
                channel.send(`📈 **DAILY REPORT (Raat 12 Baje)** 📈\n👤 <@${task.userId}> aaj ka update:\n📺 Channel: **${task.channelName}**\n✅ Views: **${currentViews.toLocaleString()}**\n📉 Remaining: **${remaining.toLocaleString()}**\n⏳ Days Left: **${task.daysLeft}**`);
            }
        }
        saveDb();
    }, { timezone: 'Asia/Karachi' });

    // ⏰ CRON 2: Har 10 Minute baad Editor ka Alarm Check
    cron.schedule('*/10 * * * *', () => {
        const now = new Date().toLocaleString("en-US", {timeZone: "Asia/Karachi"});
        const dateObj = new Date(now);
        const currentMins = dateObj.getHours() * 60 + dateObj.getMinutes();

        db.editorTasks.forEach(task => {
            if (task.completedToday) return; // Agar task complete ho chuka hai toh kuch na karo

            const [h, m] = task.deadline.split(':');
            const deadlineMins = parseInt(h) * 60 + parseInt(m);

            if (currentMins >= deadlineMins) {
                const channel = client.channels.cache.get(task.discordChannelId);
                if (channel) {
                    channel.send(`🚨 <@${task.userId}> Aaj ki deadline khatam ho gayi hai! Jaldi video bhejo!`);
                }
            }
        });
    }, { timezone: 'Asia/Karachi' });

    // ⏰ CRON 3: Raat 12 Baje Editors ka Task Reset karna (Naye din ke liye)
    cron.schedule('0 0 * * *', () => {
        db.editorTasks.forEach(task => task.completedToday = false);
        saveDb();
    }, { timezone: 'Asia/Karachi' });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const args = message.content.split(/\s+/);
    const command = args[0].toLowerCase();

    // 1️⃣ MANAGER: Task Assign Command
    if (command === '!assign') {
        const mentionedUser = message.mentions.users.first();
        if (!mentionedUser || args.length < 5) return message.reply('❌ Sahi tareeqa: `!assign @User TargetViews ChannelName Days`');
        
        const task = {
            userId: mentionedUser.id,
            targetViews: parseInt(args[2]),
            channelName: args[3],
            daysLeft: parseInt(args[4]),
            discordChannelId: message.channel.id
        };
        db.managerTasks.push(task);
        saveDb();
        message.reply(`✅ Task Saved! Raat 12 baje se iski daily auto-report shuru ho jayegi.`);
    }

    // 2️⃣ MANAGER: Task Unassign Command
    if (command === '!unassign') {
        const mentionedUser = message.mentions.users.first();
        const channelName = args[2];
        if (!mentionedUser || !channelName) return message.reply('❌ Sahi tareeqa: `!unassign @User ChannelName`');

        db.managerTasks = db.managerTasks.filter(t => !(t.userId === mentionedUser.id && t.channelName === channelName));
        saveDb();
        message.reply(`🗑️ Done! Task hata diya gaya hai. Ab iski update nahi aayegi.`);
    }

    // 3️⃣ EDITOR: Editor ki Deadline Setup
    if (command === '!editor') {
        const mentionedUser = message.mentions.users.first();
        const channelName = args[2];
        const deadline = args[3]; // Format: 15:00 (Yani dopehar 3 baje)
        if (!mentionedUser || !channelName || !deadline || !deadline.includes(':')) {
            return message.reply('❌ Sahi tareeqa: `!editor @User ChannelName 15:00` (24-Hour Format)');
        }

        db.editorTasks.push({
            userId: mentionedUser.id,
            channelName: channelName,
            deadline: deadline,
            completedToday: false,
            discordChannelId: message.channel.id
        });
        saveDb();
        message.reply(`🎬 Editor task set! Agar ${deadline} tak video na aayi, toh har 10 minute baad alarm baje ga.`);
    }

    // 4️⃣ EDITOR: Task Complete (Specific Channel Ke Liye)
    if (message.content.toLowerCase().startsWith('!done')) {
        const args = message.content.split(' ');
        const channelName = args[1];

        // Agar editor ne channel ka naam nahi likha
        if (!channelName) {
            return message.reply('❌ Sath channel ka naam bhi batayein. Misal: `!done JasonWardsNews`');
        }

        // Editor ke us makhsoos channel wale task ko dhoondna
        const editorTask = db.editorTasks.find(t => 
            t.userId === message.author.id && 
            t.channelName.toLowerCase() === channelName.toLowerCase()
        );

        if (editorTask) {
            editorTask.completedToday = true;
            saveDb();
            message.reply(`✅ Zabardast! Aap ka **${editorTask.channelName}** ka aaj ka task complete mark ho gaya hai. Alarm off! 🔕`);
        } else {
            message.reply(`❌ Mujhey aap ka '${channelName}' ka koi active task nahi mila. Spelling check karein.`);
        }
    }
    
    // 5️⃣ EDITOR: Editor Task ko Hamesha Ke Liye Delete karna
    if (command === '!stop-editor') {
        const mentionedUser = message.mentions.users.first();
        if (!mentionedUser) return message.reply('❌ Sahi tareeqa: `!stop-editor @User`');
        db.editorTasks = db.editorTasks.filter(t => t.userId !== mentionedUser.id);
        saveDb();
        message.reply(`🗑️ Editor ka record bilkul mita diya gaya hai.`);
    }
});

client.login(process.env.DISCORD_TOKEN);
