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

// 👋 Assign "Missing Info" role and greet in #❓-missing-info
client.on('guildMemberAdd', async (member) => {
  const missingInfoRole = member.guild.roles.cache.find(role => role.name === 'Missing Info');
  const welcomeChannel = member.guild.channels.cache.find(c => c.name === '❓-missing-info');

  if (missingInfoRole) {
    await member.roles.add(missingInfoRole);
    console.log(`Assigned 'Missing Info' role to ${member.user.tag}`);
  }

  if (welcomeChannel?.isTextBased()) {
    await welcomeChannel.send(
      `👋 Welcome <@${member.id}>! Please answer the questions below to complete your onboarding and gain access to the server.`
    );
  }
});

// 🧠 Onboarding
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

    await member.setNickname(`${first} ${last}`);

    // Create/assign graduation year role
    const yearRoleName = `${year}`;
    let gradRole = member.guild.roles.cache.find(role => role.name === yearRoleName);
    if (!gradRole) {
      gradRole = await member.guild.roles.create({
        name: yearRoleName,
        color: 'Random',
        reason: `Auto-created for graduation year ${year}`
      });
    }
    await member.roles.add(gradRole);

    // Determine Active or Alumni
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 0-indexed → Jan = 0
    let statusRoleName;

    if (year < currentYear) {
      statusRoleName = 'Alumni';
    } else if (year > currentYear) {
      statusRoleName = 'Active';
    } else {
      statusRoleName = currentMonth <= 5 ? 'Active' : 'Alumni'; // Jan–May = Active, June+ = Alumni
    }

    const statusRole = member.guild.roles.cache.find(role => role.name === statusRoleName);
    if (statusRole) {
      await member.roles.add(statusRole);
    } else {
      console.warn(`⚠️ Could not find role: ${statusRoleName}`);
    }

    // Remove "Missing Info"
    const missingInfoRole = member.guild.roles.cache.find(role => role.name === 'Missing Info');
    if (missingInfoRole) await member.roles.remove(missingInfoRole);

    // Public welcome message
    const everyoneChannel = member.guild.channels.cache.find(c => c.name === '💬-everyone');
    if (everyoneChannel?.isTextBased()) {
      await everyoneChannel.send(
        `🎉 Welcome <@${member.id}> to the server! Everyone say hi! 👋`
      );
    }

    await message.channel.send(`🎓 Thanks, ${first}! You’ve been onboarded and assigned to **${year}** and **${statusRoleName}**.`);
  } catch (err) {
    console.error(err);
    await message.channel.send("⚠️ Something went wrong. Please try again.");
  } finally {
    collectors.delete(member.id);
  }
});

// 🔁 Reminder every 48h at 12PM ET
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

// 🕐 Shutdown at 11PM ET
function startAutoShutdownTimer() {
  setInterval(() => {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const estHour = (utcHour - 4 + 24) % 24;
    if (estHour === 23) {
      console.log("🛑 It's 11:00 PM ET — shutting down to save Railway hours.");
      process.exit(0);
    }
  }, 60 * 1000);
}

client.login(process.env.BOT_TOKEN);
