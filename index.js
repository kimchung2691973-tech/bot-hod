const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ===================== DATABASE (in-memory) =====================
const users = {};

function getUser(userId) {
  if (!users[userId]) users[userId] = { gold: 1000, lastDaily: null };
  return users[userId];
}

function formatGold(n) {
  return Number(n).toLocaleString('vi-VN');
}

// ===================== GAME STATE =====================
let gameActive = false;
let bets = {};
let countdown = 45;
let countdownInterval = null;
let gameChannel = null;
let gameMessage = null;

// ===================== DICE EMOJI =====================
const diceEmoji = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

// ===================== UTILS =====================
function rollDice() {
  return [
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
  ];
}

function getResult(dice) {
  const total = dice.reduce((a, b) => a + b, 0);
  return {
    total,
    isTai: total >= 11,
    isXiu: total <= 10,
    isChan: total % 2 === 0,
    isLe: total % 2 !== 0,
  };
}

// ===================== EMBED + BUTTONS =====================
function buildGameEmbed(timeLeft) {
  return new EmbedBuilder()
    .setColor('#1a1a2e')
    .setTitle('🎲 Tài Xỉu HOD – Nhà cái đến từ Châu Á! 🔥🔥🔥')
    .setDescription(
      `Chọn **Tài (11-18)**, **Xỉu (3-10)**, **Chẵn/Lẻ** hoặc **số cụ thể (3-18)** để đặt cược.\n` +
      `Sau khi chọn, một bảng sẽ hiện ra để bạn nhập số gold **(tối đa 250,000 🪙)**.\n\n` +
      `**Tỉ lệ trả thưởng:**\n` +
      `• Tài/Xỉu/Chẵn/Lẻ: **1:1**\n` +
      `• Số cụ thể (3-18): **1:10**\n\n` +
      `⚠️ **LƯU Ý:** Không spam bấm nút để tránh lặp form!\n` +
      `⏰ **Thời gian còn lại: ${timeLeft} giây**`
    )
    .setFooter({ text: 'HOD – Trò chơi sẽ bắt đầu ngay và đếm ngược 45 giây.' });
}

function buildGameButtons() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bet_xiu').setLabel('Xỉu (3-10)').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('bet_tai').setLabel('Tài (11-18)').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('bet_chan').setLabel('Chẵn').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('bet_le').setLabel('Lẻ').setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    ...[3, 4, 5, 6, 7].map(n =>
      new ButtonBuilder().setCustomId(`bet_so_${n}`).setLabel(`Số ${n}`).setStyle(ButtonStyle.Secondary)
    )
  );
  const row3 = new ActionRowBuilder().addComponents(
    ...[8, 9, 10, 11, 12].map(n =>
      new ButtonBuilder().setCustomId(`bet_so_${n}`).setLabel(`Số ${n}`).setStyle(ButtonStyle.Secondary)
    )
  );
  const row4 = new ActionRowBuilder().addComponents(
    ...[13, 14, 15, 16, 17].map(n =>
      new ButtonBuilder().setCustomId(`bet_so_${n}`).setLabel(`Số ${n}`).setStyle(ButtonStyle.Secondary)
    )
  );
  const row5 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bet_so_18').setLabel('Số 18').setStyle(ButtonStyle.Secondary)
  );
  return [row1, row2, row3, row4, row5];
}

// ===================== START GAME =====================
async function startGame(channel) {
  if (gameActive) return;
  gameActive = true;
  bets = {};
  countdown = 45;
  gameChannel = channel;

  gameMessage = await channel.send({
    embeds: [buildGameEmbed(countdown)],
    components: buildGameButtons(),
  });

  countdownInterval = setInterval(async () => {
    countdown--;
    if (countdown <= 0) {
      clearInterval(countdownInterval);
      await endGame();
    } else if (countdown % 10 === 0 || countdown <= 5) {
      try {
        await gameMessage.edit({
          embeds: [buildGameEmbed(countdown)],
          components: buildGameButtons(),
        });
      } catch {}
    }
  }, 1000);
}

// ===================== END GAME =====================
async function endGame() {
  gameActive = false;
  const dice = rollDice();
  const result = getResult(dice);
  const diceStr = dice.map(d => diceEmoji[d]).join(' ');

  const summaryLines = [];

  for (const [userId, bet] of Object.entries(bets)) {
    const user = getUser(userId);
    let win = false;
    if (bet.type === 'tai' && result.isTai) win = true;
    else if (bet.type === 'xiu' && result.isXiu) win = true;
    else if (bet.type === 'chan' && result.isChan) win = true;
    else if (bet.type === 'le' && result.isLe) win = true;
    else if (bet.type === 'so' && bet.number === result.total) win = true;

    const multiplier = bet.type === 'so' ? 10 : 1;
    const betLabel = bet.type === 'tai' ? 'Tài (11-18)'
      : bet.type === 'xiu' ? 'Xỉu (3-10)'
      : bet.type === 'chan' ? 'Chẵn'
      : bet.type === 'le' ? 'Lẻ'
      : `Số ${bet.number}`;

    if (win) {
      const profit = bet.amount * multiplier;
      user.gold += profit;
      summaryLines.push(`<@${userId}> đã cược **${betLabel}**: ${formatGold(bet.amount)} 🪙 và **lụm** ${formatGold(bet.amount + profit)} 🪙 (lãi ${formatGold(profit)})`);
    } else {
      user.gold -= bet.amount;
      if (user.gold < 0) user.gold = 0;
      summaryLines.push(`<@${userId}> đã cược **${betLabel}**: ${formatGold(bet.amount)} 🪙 và **thua** ${formatGold(bet.amount)} 🪙`);
    }
  }

  const resultText =
    `Kết quả:\n` +
    `${diceStr} = **${result.total}**\n` +
    `Tài/Xỉu: **${result.isTai ? 'Tài' : 'Xỉu'}**\n` +
    `Chẵn/Lẻ: **${result.isChan ? 'Chẵn' : 'Lẻ'}**\n\n` +
    `Tổng kết:\n` +
    (summaryLines.length ? summaryLines.join('\n') : 'Không có ai đặt cược ván này.');

  try {
    await gameMessage.edit({ content: resultText, embeds: [], components: [] });
  } catch {
    await gameChannel.send(resultText);
  }

  bets = {};
  gameMessage = null;
  gameChannel = null;
}

// ===================== INTERACTIONS (Button + Modal) =====================
client.on('interactionCreate', async (interaction) => {

  // BUTTON
  if (interaction.isButton()) {
    const userId = interaction.user.id;
    const id = interaction.customId;

    if (!gameActive) {
      return interaction.reply({
        content: '⚠️ Không có ván chơi nào đang diễn ra. Dùng `!taixiu` để bắt đầu!',
        ephemeral: true,
      });
    }

    if (bets[userId]) {
      return interaction.reply({
        content: '⚠️ Bạn đã đặt cược rồi! Chờ ván kế tiếp nhé.',
        ephemeral: true,
      });
    }

    let betType = null;
    let betNumber = null;

    if (id === 'bet_tai') betType = 'tai';
    else if (id === 'bet_xiu') betType = 'xiu';
    else if (id === 'bet_chan') betType = 'chan';
    else if (id === 'bet_le') betType = 'le';
    else if (id.startsWith('bet_so_')) {
      betType = 'so';
      betNumber = parseInt(id.replace('bet_so_', ''));
    }

    if (!betType) return;

    const label = betType === 'so' ? `Số ${betNumber}` : betType.toUpperCase();

    const modal = new ModalBuilder()
      .setCustomId(`modal_${betType}_${betNumber ?? 0}`)
      .setTitle(`💰 HOD | Đặt cược: ${label}`);

    const goldInput = new TextInputBuilder()
      .setCustomId('gold_amount')
      .setLabel('Nhập số gold muốn cược (1 - 250,000)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Ví dụ: 5000')
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(7);

    modal.addComponents(new ActionRowBuilder().addComponents(goldInput));
    return interaction.showModal(modal);
  }

  // MODAL SUBMIT
  if (interaction.isModalSubmit()) {
    const userId = interaction.user.id;
    const user = getUser(userId);
    const id = interaction.customId;

    if (!gameActive) {
      return interaction.reply({ content: '⚠️ Ván chơi đã kết thúc rồi!', ephemeral: true });
    }

    if (bets[userId]) {
      return interaction.reply({ content: '⚠️ Bạn đã đặt cược rồi!', ephemeral: true });
    }

    const parts = id.replace('modal_', '').split('_');
    const betType = parts[0];
    const betNumber = parseInt(parts[1]) || null;

    const rawAmount = interaction.fields.getTextInputValue('gold_amount').replace(/[.,\s]/g, '');
    const amount = parseInt(rawAmount);

    if (isNaN(amount) || amount < 1) {
      return interaction.reply({ content: '⚠️ Số gold không hợp lệ! Nhập số nguyên dương.', ephemeral: true });
    }
    if (amount > 250000) {
      return interaction.reply({ content: '⚠️ Tối đa **250,000 gold** mỗi lần cược!', ephemeral: true });
    }
    if (user.gold < amount) {
      return interaction.reply({
        content: `⚠️ Bạn không đủ gold! Hiện có: **${formatGold(user.gold)} gold** 🪙`,
        ephemeral: true,
      });
    }

    bets[userId] = { type: betType, number: betNumber, amount };

    const label = betType === 'so' ? `Số ${betNumber}` : betType.toUpperCase();
    return interaction.reply({
      content: `✅ Đã đặt cược **${formatGold(amount)} gold** vào **${label}**! Chúc may mắn 🎲`,
      ephemeral: true,
    });
  }
});

// ===================== MESSAGE COMMANDS =====================
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim();
  if (!content.startsWith('!')) return;

  const args = content.split(/\s+/);
  const cmd = args[0].toLowerCase();
  const userId = message.author.id;
  const user = getUser(userId);

  // !taixiu
  if (cmd === '!taixiu') {
    if (gameActive) return message.reply('⚠️ Đã có ván chơi đang diễn ra rồi!');
    await startGame(message.channel);
    return;
  }

  // !daily
  if (cmd === '!daily') {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    if (user.lastDaily && now - user.lastDaily < oneDay) {
      const remaining = oneDay - (now - user.lastDaily);
      const h = Math.floor(remaining / 3600000);
      const m = Math.floor((remaining % 3600000) / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      return message.reply(`⏰ Bạn đã nhận thưởng hôm nay rồi!\nQuay lại sau **${h}h ${m}m ${s}s** nhé 🪙`);
    }

    user.gold += 500;
    user.lastDaily = now;

    const embed = new EmbedBuilder()
      .setColor('#00b894')
      .setTitle('🎁 HOD | Phần Thưởng Hàng Ngày!')
      .setDescription(
        `Chúc mừng <@${userId}>!\nBạn nhận được **+500 gold** 🪙\n\n` +
        `💰 Số dư hiện tại: **${formatGold(user.gold)} gold**`
      )
      .setFooter({ text: 'Quay lại sau 24 giờ để nhận tiếp! – HOD' });

    return message.reply({ embeds: [embed] });
  }

  // !balance
  if (cmd === '!balance' || cmd === '!gold') {
    return message.reply(`💰 **HOD** | Số dư của <@${userId}>: **${formatGold(user.gold)} gold** 🪙`);
  }

  // !help
  if (cmd === '!help') {
    const embed = new EmbedBuilder()
      .setColor('#6c5ce7')
      .setTitle('📖 HOD | Hướng Dẫn Bot Tài Xỉu')
      .setDescription('Chào mừng đến với **Tài Xỉu HOD** – Nhà cái đến từ Châu Á! 🔥')
      .addFields(
        { name: '🎲 !taixiu', value: 'Bắt đầu ván chơi mới (45 giây)', inline: false },
        { name: '🔘 Bấm nút chọn loại cược', value: 'Bảng nhập gold sẽ tự hiện ra sau khi bấm', inline: false },
        { name: '🎁 !daily', value: 'Nhận 500 gold miễn phí mỗi ngày (24h/lần)', inline: false },
        { name: '💰 !balance', value: 'Xem số gold hiện tại của bạn', inline: false },
        { name: '📊 Tỉ lệ thưởng', value: '• Tài/Xỉu/Chẵn/Lẻ: **1:1**\n• Số cụ thể: **1:10**', inline: false },
      )
      .setFooter({ text: 'HOD – Nhà cái đến từ Châu Á! 🔥' });
    return message.reply({ embeds: [embed] });
  }
});

// ===================== READY =====================
client.once('ready', () => {
  console.log(`✅ HOD Bot đã online: ${client.user.tag}`);
});

// THAY TOKEN CỦA BẠN VÀO ĐÂY
client.login(process.env.TOKEN);
