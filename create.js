process.title = 'mstdn.jp'
const lodash = require('lodash');
const axios = require('axios');
const cheerio = require('cheerio');
const chalk = require('chalk');
const pLimit = require('p-limit');
const retry = require('async-retry');
const fs = require('fs');

//const proxy = null;

const proxy = {
    protocol: 'http:',
    hostname: '127.0.0.1',
    port: 80,
    auth: {
        username: 'username',
        password: 'password'
    }
}

const quantity = 10;
const threads = 50;

const cpmCalc = async () => {
    for (;;) {
        if (!count.running) break;
        const old = count.created;
        await new Promise(resolve => setTimeout(resolve, 1000));
        count.cpm = (count.created - old) * 60;
    }
}

const randomString = (length) => {
    return Array.from({length: length}, () => lodash.sample(Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_"))).join("");
}

const create = async () => {
    const account = {
        username: randomString(5),
        password: randomString(10)
    }
    account.email = await axios.post('https://api.internal.temp-mail.io/api/v3/email/new').then(response => response.data.email)
    let response = await axios.post(
        'https://mstdn.jp/api/v1/apps',
        {
            'client_name': 'Mastodon for Android',
            'redirect_uris': 'mastodon-android-auth://callback',
            'scopes': 'read write follow push',
            'website': 'https://app.joinmastodon.org/android'
        },
        {
            headers: {
                'user-agent': 'MastodonAndroid/1.1.3',
                'content-type': 'application/json;charset=utf-8'
            },
            proxy: proxy
        }
    );
    response = await axios.post(
        'https://mstdn.jp/oauth/token',
        {
            'client_id': response.data.client_id,
            'client_secret': response.data.client_secret,
            'grant_type': 'client_credentials',
            'redirect_uri': 'mastodon-android-auth://callback',
            'scope': 'read write follow push'
        },
        {
            headers: {
                'user-agent': 'MastodonAndroid/1.1.3',
                'content-type': 'application/json;charset=utf-8'
            },
            proxy: proxy
        }
    );
    response = await axios.post(
        'https://mstdn.jp/api/v1/accounts',
        {
            'agreement': true,
            'email': account.email,
            'locale': 'ja',
            'password': account.password,
            'reason': '',
            'username': account.username
        },
        {
            headers: {
                'user-agent': 'MastodonAndroid/1.1.3',
                'authorization': `Bearer ${response.data.access_token}`,
                'content-type': 'application/json;charset=utf-8'
            },
            proxy: proxy,
            validateStatus: (status) => status < 500
        }
    );
    if (response.status !== 200) {
        throw new Error(response.data.error);
    }
    account.access_token = response.data.access_token;
    const message = await (async () => {
        for (let i = 0; i < 20; i++) {
            for (const message of await axios.get(`https://api.internal.temp-mail.io/api/v3/email/${account.email}/messages`).then(response => response.data)) {
                if (message.from.includes('noreply@mstdn.jp')) return message;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        return null;
    })();
    if (!message) {
        throw new Error('Failed to get confirmation email');
    }
    const $ = cheerio.load(message.body_html);
    const url = new URL($('body > table:nth-child(4) > tbody > tr > td > div > table > tbody > tr > td > table > tbody > tr > td > table > tbody > tr > td > a').attr('href'));
    await axios.get('https://mstdn.jp/auth/confirmation', {
        params: {
            confirmation_token: url.searchParams.get('confirmation_token')
        },
        headers: {
            'user-agent': 'MastodonAndroid/1.1.3'
        },
        proxy: proxy
    });
    response = await axios.get('https://mstdn.jp/api/v1/accounts/verify_credentials', {
        headers: {
            'user-agent': 'MastodonAndroid/1.1.3',
            'authorization': `Bearer ${response.data.access_token}`,
        },
        proxy: proxy
    });
    account.id = response.data.id;
    account.username = response.data.username;
    await fs.promises.writeFile(`accounts/${account.username}.json`, JSON.stringify(account, null, 4));
    console.log(chalk.green(` [+] ${account.email}:${account.password} | Username = ${account.username} | ID = ${account.id} | Token = ${account.access_token}`));
    count.created ++;
    return account;
}

const count = {
    created: 0,
    error: 0,
    cpm: 0,
    running: false
}
const main = async () => {
    const limit = pLimit(threads);
    count.running = true;
    (async () => {
        for (;;) {
            if (!count.running) break;
            process.title = `mstdn.jp | Createds: ${count.created} - Errors: ${count.error} | CPM: ${count.cpm}`;
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    })();
    cpmCalc();
    await Promise.all(Array.from({length: quantity}, () => limit(() => retry(async () => {
        try {
            await create();
        } catch (error) {
            count.error++;
            throw new Error(error);
        }
    }))));
    count.running = false;
    process.exit();
}

main();
