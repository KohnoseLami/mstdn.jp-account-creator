const axios = require('axios');
const chalk = require('chalk');
const pLimit = require('p-limit');
const retry = require('async-retry');
const fs = require('fs');

const proxy = {
    protocol: 'http:',
    hostname: '127.0.0.1',
    port: 80,
    auth: {
        username: 'username',
        password: 'password'
    }
}

const target = '1';
const threads = 50;

const follow = async (i) => {
    const account = await fs.promises.readFile(`accounts/${i}`).then(JSON.parse);
    const response = await axios.post(
        `https://mstdn.jp/api/v1/accounts/${target}/follow`,
        {
            'reblogs': true
        },
        {
            headers: {
                'user-agent': 'MastodonAndroid/1.1.3',
                'authorization': `Bearer ${account.access_token}`,
                'content-type': 'application/json;charset=utf-8'
            },
            proxy: proxy,
            validateStatus: (status) => status < 500
        }
    );
    if (response.status === 200) {
        console.log(`${account.username}: ${chalk.green(response.status)}`);
    } else {
        console.log(`${account.username}: ${chalk.red(response.status)}`);
    }
}

const main = async () => {
    const accounts = await fs.promises.readdir('accounts');
    const limit = pLimit(threads);
    await Promise.all(accounts.map((i) => limit(() => retry(() => follow(i)))));
}

main();
