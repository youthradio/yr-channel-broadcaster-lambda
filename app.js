require('dotenv').config();
const express = require('express');
const cors = require('cors');
const punycode = require('punycode');
const fetch = require('node-fetch');
const slackParser = require('slack-message-parser');
const { html, renderToStream } = require('@popeindustries/lit-html-server');
const emojiList = require('./emoji.json');

const TOKEN = process.env.SLACK_TOKEN;
const CHANNELID = process.env.CHANNEL;
const NodeType = slackParser.NodeType;

const getProfiles = async () => {
  return fetch(
    `https://slack.com/api/users.list?token=${TOKEN}&usergroup=SV17T0B33`,
    { timeout: 5000 }
  )
    .then(r => r.json())
    .catch(err => err);
};

const getConversations = async () => {
  return fetch(
    `https://slack.com/api/conversations.history?token=${TOKEN}&channel=${CHANNELID}&limit=20`,
    { timeout: 5000 }
  )
    .then(r => r.json())
    .catch(err => err);
};

const convertEmoji = emoji_name => {
  const emojicode = emojiList.find(e => e.short_name === emoji_name);
  if (emojicode) {
    const bytes = emojicode.unified.split('-').map(p => parseInt(p, 16));
    return punycode.ucs2.encode(bytes);
  }
  return '';
};

const stringifyNode = node => {
  switch (node.type) {
    case NodeType.Command:
      return html`
        <strong>#${node.name}</strong>
      `;
    case NodeType.Emoji:
      return html`
        ${convertEmoji(node.name)}
      `;
    case NodeType.Text:
      return node.text;
    case NodeType.Bold:
      return html`
        <strong>${node.children.map(stringifyNode).join('')}</strong>
      `;
    case NodeType.Italic:
      return html`
        <i>${node.children.map(stringifyNode).join('')}</i>
      `;
    case NodeType.Strike:
      return html`
        <del>${node.children.map(stringifyNode).join('')}</del>
      `;
    case NodeType.Root:
      return html`
        ${node.children.map(stringifyNode)}
      `;
    default:
      return html``;
  }
};
const corsOptions = {
  origin: '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  preflightContinue: false,
  optionsSuccessStatus: 204
};
const app = express();

app.use(cors(corsOptions));

app.get('/', (req, res) => {
  res.send('Nothing here');
});

app.get('/list', async (req, res, next) => {
  try {
    const conversations = await getConversations();
    const profiles = await getProfiles();
    const usersInConversation = conversations.messages.map(msg => msg.user);
    const profilesList = new Map(
      profiles.members
        .filter(user => usersInConversation.includes(user.id))
        .map(e => [e.id, e])
    );
    const out = html`
  <ol>
  ${conversations.messages
    .slice(0, 20)
    .reverse()
    .map(msg => {
      return html`
        <li>
          <div style="display:flex;">
            <div style="margin-right:0.5rem">
              <img
                style="width: 50px;heigth:auto;"
                src="${profilesList.get(msg.user).profile.image_72}"
              />
            </div>
            <div>
              <h6>${profilesList.get(msg.user).profile.display_name}</h6>
              ${stringifyNode(slackParser.parse(msg.text))}
            </div>
          </div>
        </li>
      `;
    })}
  </ul>
  `;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    renderToStream(out).pipe(res);
  } catch (err) {
    next(err);
    return;
  }
});

// const port = process.env.PORT;
// app.listen(port, () => console.log(`Example app listening on port ${port}!`));

module.exports = app;
