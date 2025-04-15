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
  startReminderCron();
});

client.on('guildMemberAdd', async (member) => {
  const guild = member.guild;
  const missingInfoRole = guild.roles.cache.find(role => role.name === 'Missing Info');
  const newMembersChannel = guild.channels.cache.find(c => c.name === '❓-new-members');

  if (missingInfoRole) {
    await member.roles.add(missingInfoRole);
    console.log(`✅ Assigned 'Missing Info' role to ${member.user.tag}`);
  }

  if (newMembersChannel?.isTextBased()) {
    await newMembersChannel.send(`👋 Welcome <@${member.id}>! Please answer the questions below to complete your onboarding and gain access to the server.`);
    beginOnboarding(member, newMembersChannel);
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // 🟡 Manual trigger keyword for admins
  if (message.content.trim().toUpperCase() === 'CLVEN') {
    await promptMissingInfoUsers(message.guild);
  }
});

async function beginOnboarding(member, channel) {
  const ask = async (question) => {
    await channel.send(`<@${member.id}>, ${question}`);
    const collected = await channel.awaitMessages({
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
      await channel.send("⚠️ Could not complete onboarding. Please try again or contact an admin.");
      return;
    }

    await member.setNickname(`${first} ${last}`);

    // Assign or create grad year role
    const yearRole = member.guild.roles.cache.find(r => r.name === `${year}`) ||
      await member.guild.roles.create({ name: `${year}`, reason: 'Auto-onboarding' });
    await member.roles.add(yearRole);

    // Determine Active vs Alumni
    const now = new Date();
    const currentYear = now.getFullYear();
    const cutoff = new Date(currentYear, 5, 1); // June 1st
    let statusRoleName = 'Alumni';

    if (year > currentYear) {
      statusRoleName = 'Active';
    } else if (year === currentYear && now < cutoff) {
      statusRoleName = 'Active';
    }

    const statusRole = member.guild.roles.cache.find(r => r.name === statusRoleName);
    if (statusRole) await member.roles.add(statusRole);

    // Remove Missing Info role
    const missingInfoRole = member.guild.roles.cache.find(r => r.name === 'Missing Info');
    if (missingInfoRole) await member.roles.remove(missingInfoRole);

    // Welcome message in 📢-announcements
    const announcements = member.guild.channels.cache.find(c => c.name === '📢-announcements');
    if (announcements?.isTextBased()) {
      await announcements.send(`🎉 Welcome Brother <@${member.id}>, class of ${year}!`);
    }

    await channel.send(`🎓 Thanks, ${first}! You’ve been onboarded and assigned to **${year}** and **${statusRoleName}**.`);
    console.log(`🎓 Onboarded ${member.user.tag} as ${first} ${last}, ${year} (${statusRoleName})`);
  } catch (err) {
    console.error("❌ Onboarding failed:", err);
    await channel.send("⚠️ Something went wrong. Please try again or contact an admin.");
  }
}

// 🔁 Daily reminder at 12 PM ET + Manual trigger support
function startReminderCron() {
  cron.schedule('0 12 * * *', async () => {
    const guild = client.guilds.cache.first();
    if (!guild) return;
    await promptMissingInfoUsers(guild);
  }, {
    timezone: "America/New_York"
  });
}

async function promptMissingInfoUsers(guild) {
  const missingRole = guild.roles.cache.find(r => r.name === 'Missing Info');
  const channel = guild.channels.cache.find(c => c.name === '❓-new-members');
  if (!missingRole || !channel?.isTextBased()) return;

  const members = missingRole.members.filter(member => !member.user.bot);
  if (members.size === 0) {
    console.log("✅ No users in 'Missing Info' at prompt time.");
    return;
  }

  await channel.send(`🔔 **Reminder to complete onboarding:**`);
  for (const member of members.values()) {
    await channel.send(`⏰ <@${member.id}> please respond to the onboarding questions so we can get you full access!`);
  }

  console.log(`✅ Prompted ${members.size} user(s) stuck in onboarding.`);
}

// ⏱ Auto shutdown at 11 PM ET
function startAutoShutdownTimer() {
  setInterval(() => {
    const now = new Date();
    const estHour = (now.getUTCHours() - 4 + 24) % 24;
    if (estHour === 23 && now.getMinutes() === 0) {
      console.log("🛑 It's 11:00 PM ET — shutting down to save Railway hours.");
      process.exit(0);
    }
  }, 60000);
}

client.login(process.env.DISCORD_TOKEN);
