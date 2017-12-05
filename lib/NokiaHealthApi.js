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

const measurementTypeMap = {
	1: 'weight',
	2: 'height',
	5: 'fat_free_mass',
	6: 'fat_ratio',
	8: 'fat_mass_weight',
	9: 'diastolic_blood_pressure',
	10: 'systolic_blood_pressure',
	11: 'heart_pulse',
	54: 'sp02',
	71: 'body_temperature',
	73: 'skin_temperature',
	76: 'muscle_mass',
	77: 'hydration',
	88: 'bone_mass',
	91: 'pulse_wave_velocity',
}

const typeMeasurementMap = {};

for( let key in measurementTypeMap ) {
	let value = measurementTypeMap[key];
	typeMeasurementMap[ value ] = parseInt(key);
}

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
	async _call( method, path, qs, data, isRefreshed ) {

		if( typeof this._token !== 'object' )
			throw new Error('Missing token');
			
		qs = qs || {}
		qs.access_token = this._token.access_token;
		for( let key in qs ) {
			let value = qs[key];
			if( typeof value === 'undefined' ) delete qs[key];
		}
		qs = querystring.stringify(qs);
		
		let url = `${this._apiUrl}${path}?${qs}`;
						
		return rp({
			method: method,
			url: url,
			json: data || true,
		}).then( result => {
			if( !isRefreshed && result && result.status === 401 ) 
				return this.refreshOAuth2Token().then( token => {
					this.setToken(token);
					this.emit('token', this._token);
					return this._call( method, path, data, true );
				});
			return result.body || result;
		})
	}

	_get( path, qs ) {
		return this._call( 'GET', path, qs );
	}

	_post( path, qs, data ) {
		return this._call( 'POST', path, qs, data );
	}

	_put( path, qs, data ) {
		return this._call( 'PUT', path, qs, data );
	}

	_delete( path, qs, data ) {
		return this._call( 'DELETE', path, qs, data );
	}
	
	/*
		Nokia Health Methods
	*/
	
	async getUserInfo() {
		return this._get('/user', {
			action: 'getinfo'
		});
	}
	
	async getMeasurement({ userid, startdate, enddate, lastupdate, meastype, category, limit, offset }) {
		
		if( typeof meastype === 'string' )
			meastype = typeMeasurementMap[meastype];
		
		return this._get('/measure', {
			action: 'getmeas',
			userid: userid,
			startdate: startdate,
			enddate: enddate,
			lastupdate: lastupdate,
			meastype: meastype,
			category: category,
			limit: limit,
			offset: offset
		})
	}
	
	async createSubscription( userId, types ) {
		if( !Array.isArray(types) )
			types = [ 'weight' ];
		
		return Promise.all(
			[].concat([
				this._registerWebhook( userId ),
				types.map(type => typeMeasurementMap[type]).map(activityId => {
					return this._get('/notify', {
						action: 'subscribe',
						callbackurl: encodeURIComponent(this._webhooksUri),
						appli: activityId
					})
				})
			])
		);
	}
	
	async deleteSubscription() {
		return Promise.all([
			this._unregisterWebhook(),
			this._get('/notify', {
				action: 'revoke',
				callbackurl: encodeURIComponent(this._webhooksUri),
				appli: 45
			})
		]);
	}
	
	/*
		Webhook methods
	*/
	async _registerWebhook( userId ) {
		if( this._webhook )
			throw new Error('webhook_already_registered');
			
		this._webhook = new Homey.CloudWebhook( this._webhooksId, this._webhooksSecret, { userId: userId } )
		this._webhook.on('message', ( message => {
			let body = message.body;
			if( !body.userid ) return;
			
			this.getMeasurement({
				userid: body.userid,
				meastype: body.appli,
				startdate: body.startdate,
				enddate: body.enddate,
			}).then( result => {
				
				let measurement = result.measuregrps[0].measures[0];
				let value = measurement.value;
				
				for( let i = 0; i > measurement.unit; i-- ) {
					value /= 10;
				}
								
				this.emit('measurement', {
					type: measurementTypeMap[body.appli],
					value: value
				})
			}).catch( err => {
				console.error(err);
			})
		}))
		return this._webhook.register();
	}
	
	async _unregisterWebhook() {
		if( !this._webhook )
			throw new Error('webhook_not_registered');
			
		return this._webhook.unregister();
	}
		
}

module.exports = NokiaHealthApi;