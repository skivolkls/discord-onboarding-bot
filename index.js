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

const collectors = new Map();

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  startAutoShutdownTimer();
  startReminderCron();
});

client.on('guildMemberAdd', async (member) => {
  const guild = member.guild;
  const missingInfoRole = guild.roles.cache.find(role => role.name === 'Missing Info');
  const onboardingChannel = guild.channels.cache.find(c => c.name === '❓-onboarding');

  if (missingInfoRole) {
    await member.roles.add(missingInfoRole);
    console.log(`✅ Assigned 'Missing Info' role to ${member.user.tag}`);
  }

  if (onboardingChannel?.isTextBased()) {
    await onboardingChannel.send(`👋 Welcome <@${member.id}>! Please answer the questions below to complete your onboarding and gain access to the server.`);
    beginOnboarding(member, onboardingChannel);
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const content = message.content.trim().toUpperCase();

  if (content === 'CLVEN') {
    await promptMissingInfoUsers(message.guild);
  }

  if (content === 'BOT STATUS') {
    const guild = message.guild;
    const missingRole = guild.roles.cache.find(r => r.name === 'Missing Info');
    const missingCount = guild.members.cache.filter(m => m.roles.cache.has(missingRole?.id)).size;
    await message.channel.send(`✅ Bot is online.\n👤 Users with 'Missing Info' role: ${missingCount}\n🕛 Daily reminders run at 12PM ET.\n📴 Auto shutdown occurs at 11PM ET.`);
  }
});

async function beginOnboarding(member, channel) {
  if (collectors.has(member.id)) return;

  collectors.set(member.id, true);

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
    const first = await ask("what’s your **first name**?");
    const last = await ask("what’s your **last name**?");
    const yearInput = await ask("what’s your **graduation year**?");
    const year = parseInt(yearInput);

    if (!first || !last || isNaN(year)) {
      await channel.send("⚠️ Could not complete onboarding. Please try again or contact an admin.");
      return;
    }

    await member.setNickname(`${first} ${last}`);

    const yearRole = member.guild.roles.cache.find(r => r.name === `${year}`) ||
      await member.guild.roles.create({ name: `${year}`, reason: 'Auto-onboarding' });
    await member.roles.add(yearRole);

    const now = new Date();
    const currentYear = now.getFullYear();
    const cutoff = new Date(currentYear, 5, 1);
    let statusRoleName = 'Alumni';

    if (year > currentYear || (year === currentYear && now < cutoff)) {
      statusRoleName = 'Active';
    }

    const statusRole = member.guild.roles.cache.find(r => r.name === statusRoleName);
    if (statusRole) await member.roles.add(statusRole);

    const missingInfoRole = member.guild.roles.cache.find(r => r.name === 'Missing Info');
    if (missingInfoRole) await member.roles.remove(missingInfoRole);

    const announcements = member.guild.channels.cache.find(c => c.name === '📢-announcements');
    if (announcements?.isTextBased()) {
      await announcements.send(`🎉 Welcome Brother <@${member.id}>, class of ${year}!`);
    }

    await channel.send(`🎓 Thanks, ${first}! You’ve been onboarded and assigned to **${year}** and **${statusRoleName}**.`);
    console.log(`🎓 Onboarded ${member.user.tag} as ${first} ${last}, ${year} (${statusRoleName})`);
  } catch (err) {
    console.error("❌ Onboarding failed:", err);
    await channel.send("⚠️ Something went wrong. Please try again or contact an admin.");
  } finally {
    collectors.delete(member.id);
  }
}

// 🔁 Daily reminder at 12PM ET
function startReminderCron() {
  cron.schedule('0 12 * * *', async () => {
    const guild = client.guilds.cache.first();
    if (guild) await promptMissingInfoUsers(guild);
  }, { timezone: "America/New_York" });
}

async function promptMissingInfoUsers(guild) {
  try {
    await guild.members.fetch();
    const missingRole = guild.roles.cache.find(r => r.name === 'Missing Info');
    const onboardingChannel = guild.channels.cache.find(c => c.name === '❓-onboarding');
    if (!missingRole || !onboardingChannel?.isTextBased()) return;

    const stuckMembers = guild.members.cache.filter(m =>
      m.roles.cache.has(missingRole.id) && !m.user.bot
    );

    if (stuckMembers.size === 0) {
      console.log("✅ No users in 'Missing Info' at prompt time.");
      return;
    }

    await onboardingChannel.send(`🔔 **Reminder to complete onboarding:**`);

    for (const member of stuckMembers.values()) {
      await onboardingChannel.send(`⏰ <@${member.id}> what’s your **first name**? (Let’s get started!)`);
      beginOnboarding(member, onboardingChannel);
    }

    console.log(`✅ Prompted ${stuckMembers.size} user(s) stuck in onboarding.`);
  } catch (err) {
    console.error("❌ Error during prompt:", err);
  }
}

// ⏱ Auto shutdown at 11PM ET
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
