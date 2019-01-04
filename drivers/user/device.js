'use strict';

const Homey = require('homey');
const { OAuth2Device, OAuth2Util, OAuth2Token } = require('homey-oauth2app');
const { parseMeasurementResult } = require('../../lib/NokiaHealthOAuth2Client');

module.exports = class NokiaHealthDevice extends OAuth2Device {
  
  onOAuth2Migrate() {
    const store = this.getStore();
    if( store.token ) {
      const token = new OAuth2Token(store.token);
      const sessionId = OAuth2Util.getRandomId();
      const configId = this.getDriver().getOAuth2ConfigId();
      
      return {
        sessionId,
        configId,
        token,
      }
    }
  }
  
  onOAuth2MigrateSuccess() {
    this.unsetStoreValue('token');    
  }

	onOAuth2Init() {
  	this.onMeasurements = this.onMeasurements.bind(this);

		const { userId } = this.getData();
		this.userId = userId;

		this.oAuth2Client.on(`${userId}:measurements`, this.onMeasurements);
		this.oAuth2Client.createSubscription({ userId })
			.then(() => {
				this.log('Subscribed to webhook events');
				return this.sync();
			})
			.then(() => {
				this.log('Successfully got latest measurement');
				this.setAvailable();
			})
			.catch( err => {
				this.error(err);
				this.setUnavailable( err );
			})
	}

	sync() {
  	const { userId } = this;
		this.oAuth2Client.getMeasurement({
  		userId,
		}).then( result => {
			const measurements = parseMeasurementResult( result );
			return this._syncMeasurements(measurements);
		}).catch( this.error );
	}

	async _syncMeasurements( measurements ) {
		const promises = [];
		for( let type in measurements ) {
			const value = measurements[type];
			if( typeof value === 'undefined' ) continue;
			
			const capabilityId = `nh_measure_${type}`
			if( !this.hasCapability(capabilityId) ) continue;
			
			const promise = this.setCapabilityValue(capabilityId, value)
			promises.push( promise );
		}
		return Promise.all( promises );
	}

	onOAuth2Deleted() {
  	const { userId } = this;
		this.oAuth2Client.deleteSubscription({ userId }).catch( this.error )
		this.oAuth2Client.removeListener(`${userId}:measurements`, this.onMeasurements);
	}

	onMeasurements( measurements ) {
		this.log('_onMeasurements', measurements);
		this._syncMeasurements( measurements ).catch( this.error );
	}

}