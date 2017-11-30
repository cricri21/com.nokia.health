'use strict';

const events = require('events');
const querystring = require('querystring');

const Homey = require('homey');

const rp = require('request-promise-native');

const scopes = [
	'user.info',
	'user.metrics',
	'user.activity',
]

class NokiaHealthApi extends events.EventEmitter {
	
	constructor() {
		super();
	
		this._clientId = Homey.env.CLIENT_ID;
		this._clientSecret = Homey.env.CLIENT_SECRET;
		this._oAuth2AuthorizationUrl = `https://account.health.nokia.com/oauth2_user/authorize2`;
		this._oAuth2TokenUrl = `https://account.health.nokia.com/oauth2/token`
		this._apiUrl = `https://api.health.nokia.com`;
		this._redirectUri = 'https://callback.athom.com/oauth2/callback';
		
		this._webhooksId = Homey.env.WEBHOOKS_ID;
		this._webhooksSecret = Homey.env.WEBHOOKS_SECRET;
		this._webhooksUri = `https://webhooks.athom.com/webhook/${this._webhooksId}`;
		this._token = null;
	}

	/*
		OAuth2 Methods
	*/
	getOAuth2AuthorizationUrl() {
		let qs = querystring.stringify({
			client_id: this._clientId,
			response_type: 'code',
			scope: scopes.join(','),
			redirect_uri: this._redirectUri,
			state: Math.random()
		});
		return `${this._oAuth2AuthorizationUrl}?${qs}`;
	}

	async getOAuth2Token( code ) {
		return rp.post({
			url: this._oAuth2TokenUrl,
			json: true,
			form: {
				client_id: this._clientId,
				client_secret: this._clientSecret,
				grant_type: 'authorization_code',
				code: code,
				redirect_uri: this._redirectUri,
			}
		}).catch( err => {
			if( err && err.error ) {
				throw new Error( err.error.error || err.error )
			} else {
				throw err;
			}
		});
	}

	async refreshOAuth2Token() {
		console.log('refreshOAuth2Token')

		if( typeof this._token !== 'object' )
			throw new Error('Missing token');
			
		return rp.post({
			url: this._oAuth2TokenUrl,
			json: true,
			form: {
				client_id: this._clientId,
				client_secret: this._clientSecret,
				refresh_token: this._token.refresh_token,
				grant_type: 'refresh_token',
			}
		})
	}

	getToken() {
		return this._token;
	}

	setToken( token ) {
		this._token = token;
	}
	
	/*
		API Helper methods
	*/	
	async _call( method, path, data, isRefreshed ) {

		if( typeof this._token !== 'object' )
			throw new Error('Missing token');
						
		return rp({
			method: method,
			url: `${this._apiUrl}${path}&access_token=${this._token.access_token}`,
			json: data || true,
		}).then( result => {
			if( !isRefreshed && result && result.status === 401 ) 
				return this.refreshOAuth2Token().then( token => {
					console.log('token', token)
					this.setToken(token);
					this.emit('token', this._token);
					return this._call( method, path, data, true );
				});
			return result;		
		})
	}

	_get( path ) {
		return this._call( 'GET', path );
	}

	_post( path, data ) {
		return this._call( 'POST', path, data );
	}

	_put( path, data ) {
		return this._call( 'PUT', path, data );
	}

	_delete( path, data ) {
		return this._call( 'DELETE', path, data );
	}
	
	/*
		Nokia Health Methods
	*/
	
	async getUserInfo() {
		return this._get(`/user?action=getinfo`);
	}
	
	async createSubscription() {
		return Promise.all(
			[].concat([
				this._registerWebook(),
				[ 1, 4, 16, 44 ].map(activityId => this._get(`/notify?action=subscribe&callbackurl=${encodeURIComponent(this._webhooksUri)}&appli=${activityId}`))				
			])
		);
	}
	
	async deleteSubscription() {
		return Promise.all([
			this._unregisterWebhook(),
			this._get(`/notify?action=revoke&callbackurl=${encodeURIComponent(this._webhooksUri)}&appli=${45}`)
		]);
	}
	
	/*
		Webhook methods
	*/
	async _registerWebook() {
		if( this._webhook )
			throw new Error('webhook_already_registered');
			
		this._webhook = new Homey.CloudWebhook( this._webhooksId, this._webhooksSecret, { userId: 'TODO' } )
		this._webhook.on('message', ( message => {
			console.log('onMessage', message) // TODO
		}))
		return this._webhook.register();
	}
	
	async _unregisterWebook() {
		if( !this._webhook )
			throw new Error('webhook_not_registered');
			
		return this._webhook.unregister();
	}
		
}

module.exports = NokiaHealthApi;