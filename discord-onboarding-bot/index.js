import { Client, GatewayIntentBits, Partials } from 'discord.js';
import dotenv from 'dotenv';
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
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('guildMemberAdd', async member => {
  const role = member.guild.roles.cache.find(role => role.name === 'Missing Info');
  if (role) await member.roles.add(role);
});

const collectors = new Map();

client.on('messageCreate', async message => {
  if (message.channel.name !== '❓-missing-info' || message.author.bot) return;

  const member = message.member;
  if (!member.roles.cache.some(role => role.name === 'Missing Info')) return;
  if (collectors.has(member.id)) return;

  const ask = async (q) => {
    await message.channel.send(`<@${member.id}>, ${q}`);
    const collected = await message.channel.awaitMessages({
      filter: m => m.author.id === member.id,
      max: 1,
      time: 60000
    });
    return collected.first()?.content;
  };

  collectors.set(member.id, true);
  try {
    const first = await ask("what's your **first name**?");
    const last = await ask("what's your **last name**?");
    const year = parseInt(await ask("what's your **graduation year**?"));

    if (!first || !last || isNaN(year)) {
      await message.channel.send("Invalid input. Please try again.");
      return;
    }

    await member.setNickname(`${first} ${last}`);

    const now = new Date().getFullYear();
    const roleName = year >= now ? 'Active' : 'Alumni';
    const assignRole = member.guild.roles.cache.find(role => role.name === roleName);
    const missingRole = member.guild.roles.cache.find(role => role.name === 'Missing Info');

    if (assignRole) await member.roles.add(assignRole);
    if (missingRole) await member.roles.remove(missingRole);

    await message.channel.send(`Welcome, ${first}! You've been added as **${roleName}**.`);
  } catch (e) {
    console.error(e);
    await message.channel.send("Something went wrong. Try again later.");
  } finally {
    collectors.delete(member.id);
  }
});

client.login(process.env.BOT_TOKEN);
