'use strict';

const Homey = require('homey');
const { OAuth2Driver } = require('homey-oauth2app');

module.exports = class NokiaHealthDriver extends OAuth2Driver {
  
  async onPairListDevices({ oAuth2Client }) {
    const { user } = await oAuth2Client.getUserInfo();
    return [
      {
        data: {
          userId: String(user.id),
        }
      }
    ]
  }
	
}