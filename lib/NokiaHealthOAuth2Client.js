'use strict';

const Homey = require('homey');
const { OAuth2Client } = require('homey-oauth2app');

const WEBHOOK_ACTIVITY_IDS = [ 1, 4, 16, 44 ];
const MEASUREMENT_TYPE_MAP = {
	1: 'weight',
	2: 'height',
	5: 'fat_free_mass',
	6: 'fat_ratio',
	8: 'fat_mass_weight',
	9: 'diastolic_blood_pressure',
	10: 'systolic_blood_pressure',
	11: 'heart_pulse',
	54: 'spo2',
	71: 'body_temperature',
	73: 'skin_temperature',
	76: 'muscle_mass',
	77: 'hydration',
	88: 'bone_mass',
	91: 'pulse_wave_velocity',
}

const TYPE_MEASUREMENT_MAP = {};

for( let key in MEASUREMENT_TYPE_MAP ) {
	const value = MEASUREMENT_TYPE_MAP[key];
	TYPE_MEASUREMENT_MAP[value] = parseInt(key);
}

module.exports = class NokiaHealthOAuth2Client extends OAuth2Client {
   
  onInit() {
    this.onWebhookMessage = this.onWebhookMessage.bind(this);
    this._webhooksId = Homey.env.WEBHOOKS_ID;
		this._webhooksSecret = Homey.env.WEBHOOKS_SECRET;
		this._webhooksUrl = `https://webhooks.athom.com/webhook/${this._webhooksId}?r=${Math.random()}`;
  }
  
  /*
   * OAuth2Client overrides
   */
  
  onHandleAuthorizationURLScopes({ scopes }) {
    return scopes.join(',');
  }
  
  async onRequestQuery({ query }) {
    const token = await this.getToken();
    if(!token)
      throw new OAuth2Error('Missing Token');
      
    for( let key in query ) {
      if(typeof query[key] === 'undefined' )
        delete query[key];
    }
      
    const { access_token } = token;
    
    return {
      ...query,
      access_token,
    }
  }
  
  async onRequestHeaders({ headers }) {
    return headers;
  }
  
  async onHandleResult({ result }) {
    const {
      body,
      error,
    } = JSON.parse(result);
    
    if( error )
      throw new Error(error);
      
    return body;
  }
  
  /*
   * Nokia Health API Methods
   */

	async getUserInfo() {
		return this.get({
  		path: '/user',
  		query: {
    		action: 'getinfo',
  		}
    });
	}
	
	async getMeasurement({
  	userId,
  	startdate,
  	enddate,
  	lastupdate,
  	meastype,
  	category,
  	limit,
    offset,
  }) {
		if( typeof meastype === 'string' )
			meastype = TYPE_MEASUREMENT_MAP[meastype];

		return this.get({
  		path: '/measure',
  		query: {
  			action: 'getmeas',
  			userid: userId,
  			startdate,
  			enddate,
  			lastupdate,
  			meastype,
  			category,
  			limit,
  			offset,
  		}
		});  	
	}
	
	/*
   * Webhook management
   */
   
  async createSubscription({ userId }) {
    await	this._registerWebhook({ userId });
		await Promise.all(WEBHOOK_ACTIVITY_IDS.map(async activityId => {
			return this.get({
				path: '/notify',
				query: {
					action: 'subscribe',
					callbackurl: this._webhooksUrl,
					appli: activityId
				}
			})
		}));
  }
  
  async deleteSubscription({ userId }) {
    await this._unregisterWebhook();
		await Promise.all(WEBHOOK_ACTIVITY_IDS.map(async activityId => {
  		await this.get({
  			path: '/notify',
  			query: {
  				action: 'revoke',
  				callbackurl: this._webhooksUrl,
  				appli: activityId,
        }
  		});
		}));
  }
  
	async _registerWebhook({ userId }) {
		if( this._webhook )
			throw new Error('webhook_already_registered');

		this._webhook = new Homey.CloudWebhook( this._webhooksId, this._webhooksSecret, { userId } )
		this._webhook.on('message', this.onWebhookMessage)
		
		await this._webhook.register();
	}

	async _unregisterWebhook() {
		if( !this._webhook ) return;

		this._webhook.removeListener('message', this.onWebhookMessage);
		await this._webhook.unregister();
	}

	onWebhookMessage( message ) {
		const { body } = message;
		const { userid } = body;
		if( !userid ) return;
		
		const {
  		startdate,
  		enddate,
  		appli: meastype,
		} = body;

		this.getMeasurement({
			userid,
			meastype,
			startdate,
			enddate,
		}).then( result => {
			const measurements = this.constructor.parseMeasurementResult( result );
			this.emit(`${userid}:measurements`, measurements);
		}).catch( err => {
			console.error(err);
		})
	}

  /*
   * Helpers
   */
   
	static parseMeasurementResult( result ) {
		let measurements = {};

		result.measuregrps.sort(( a, b ) => {
			return b.date - a.date;
		})

		for( let i = 0; i < result.measuregrps.length; i++ ) {
			let grp = result.measuregrps[i];
			if( !grp || !Array.isArray(grp.measures) ) continue;

			grp.measures.sort(( a, b ) => {
				return b.date - a.date;
			})
			for( let j = 0; j < grp.measures.length; j++ ) {
				let measure = grp.measures[j];
				let type = MEASUREMENT_TYPE_MAP[ measure.type ];
				if( type && typeof measurements[ type ] === 'undefined' ) {
					let value = measure.value;
					for( let k = 0; k > ( measure.unit || 0 ); k-- ) {
						value /= 10;
					}
					measurements[ type ] = value;
				}
			}
		}

		return measurements;
	}
  
}