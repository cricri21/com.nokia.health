'use strict';

const { OAuth2App } = require('homey-oauth2app');
const NokiaHealthOAuth2Client = require('./lib/NokiaHealthOAuth2Client');

const SCOPES = [
	'user.info',
	'user.metrics',
	'user.activity',
]

module.exports = class NokiaHealthApp extends OAuth2App {
  
  onOAuth2Init() {
    this.setOAuth2Config({
      client: NokiaHealthOAuth2Client,
      apiUrl: 'https://api.health.nokia.com',
      tokenUrl: 'https://account.health.nokia.com/oauth2/token',
      authorizationUrl: 'https://account.health.nokia.com/oauth2_user/authorize2',
      scopes: SCOPES,
    });    
  }
  
}