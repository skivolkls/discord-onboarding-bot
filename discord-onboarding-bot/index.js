import { Client, GatewayIntentBits, Partials } from 'discord.js';
import dotenv from 'dotenv';
import cron from 'node-cron';
dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  startAutoShutdownTimer();
});

// Auto-assign "Missing Info" role on join
client.on('guildMemberAdd', async (member) => {
  const missingInfoRole = member.guild.roles.cache.find(role => role.name === 'Missing Info');
  if (missingInfoRole) {
    await member.roles.add(missingInfoRole);
    console.log(`Assigned 'Missing Info' role to ${member.user.tag}`);
  }
});

// Collect user input for onboarding
const collectors = new Map();

client.on('messageCreate', async (message) => {
  if (message.channel.name !== '❓-missing-info') return;
  if (message.author.bot) return;

  const member = message.member;
  const hasMissingInfo = member.roles.cache.some(role => role.name === 'Missing Info');
  if (!hasMissingInfo) return;

  if (collectors.has(member.id)) return;
  collectors.set(member.id, true);

  const ask = async (question) => {
    await message.channel.send(`<@${member.id}>, ${question}`);
    const collected = await message.channel.awaitMessages({
      filter: m => m.author.id === member.id,
      max: 1,
      time: 60000
    });
    return collected.first()?.content?.trim();
  };

  try {
    const first = await ask("what's your **first name**?");
    const last = await ask("what's your **last name**?");
    const yearInput = await ask("what's your **graduation year**?");
    const year = parseInt(yearInput);

    if (!first || !last || isNaN(year)) {
      await message.channel.send("❌ Invalid input. Please try again or contact an admin.");
      return;
    }

    // Set nickname
    await member.setNickname(`${first} ${last}`);

    // Assign or create graduation year role
    const roleName = `${year}`;
    let gradRole = member.guild.roles.cache.find(role => role.name === roleName);

    if (!gradRole) {
      gradRole = await member.guild.roles.create({
        name: roleName,
        color: 'Random',
        reason: `Auto-created for graduation year ${year}`,
      });
    }

    await member.roles.add(gradRole);

    // Remove "Missing Info"
    const missingInfoRole = member.guild.roles.cache.find(role => role.name === 'Missing Info');
    if (missingInfoRole) await member.roles.remove(missingInfoRole);

    await message.channel.send(`🎓 Welcome, ${first}! You've been added to **${year}**.`);
  } catch (err) {
    console.error(err);
    await message.channel.send("⚠️ Something went wrong. Please try again.");
  } finally {
    collectors.delete(member.id);
  }
});

// Reminder every 48 hours at 12:00 PM ET
cron.schedule('0 12 */2 * *', async () => {
  const guild = client.guilds.cache.first();
  if (!guild) return;

  const missingInfoRole = guild.roles.cache.find(r => r.name === 'Missing Info');
  const verifyChannel = guild.channels.cache.find(c => c.name === '❓-missing-info');

  if (!missingInfoRole || !verifyChannel?.isTextBased()) return;

  const members = await guild.members.fetch();
  const stuckUsers = members.filter(member =>
    member.roles.cache.has(missingInfoRole.id) && !member.user.bot
  );

  if (stuckUsers.size > 0) {
    await verifyChannel.send(`🔔 **Reminder to complete onboarding:**`);
    for (const member of stuckUsers.values()) {
      await verifyChannel.send(`<@${member.id}> — please respond to the onboarding questions so we can get you set up!`);
    }
    console.log(`✅ Reminder sent to ${stuckUsers.size} user(s).`);
  } else {
    console.log('✅ No users with Missing Info role found at reminder time.');
  }
}, {
  timezone: "America/New_York"
});

// 🔌 Automatically shut down at 11:00 PM ET daily
function startAutoShutdownTimer() {
  setInterval(() => {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const estHour = (utcHour - 4 + 24) % 24; // Convert to ET manually

    if (estHour === 23) {
      console.log("🛑 It's 11:00 PM ET — shutting down to save Railway hours.");
      process.exit(0);
    }
  }, 60 * 1000); // Check every 1 minute
}

client.login(process.env.BOT_TOKEN);
