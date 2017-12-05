'use strict';

const Homey = require('homey');
const NokiaHealthApi = require('../../lib/NokiaHealthApi');

class NokiaHealthDevice extends Homey.Device {

	onInit() {

		let data = this.getData();
		this._userId = data.userId;

		let store = this.getStore();
		this._api = new NokiaHealthApi();
		this._api.on('measurements', this._onMeasurements.bind(this));
		this._api.on('token', this._onToken.bind(this));
		this._api.setToken( store.token );
		this._api.createSubscription( this._userId )
			.then(() => {
				this.log('Subscribed to webhook events');
				return this.sync();
			})
			.then(() => {
				this.log('Successfully got latest measurement');
			})
			.catch( err => {
				this.error(err);
				this.setUnavailable( err );
			})
	}

	sync() {
		this._api.getMeasurement({
			userid: this._userId,
		}).then( result => {
			let measurements = NokiaHealthApi.parseMeasurementResult( result );
			return this._syncMeasurements(measurements);
		}).catch( this.error );
	}

	_syncMeasurements( measurements ) {
		let promises = [];
		for( let type in measurements ) {
			let value = measurements[type];
			if( typeof value !== 'undefined' ) {
				let capabilityId = `nh_measure_${type}`
				if( this.hasCapability(capabilityId) ) {
					let promise = this.setCapabilityValue(capabilityId, value)
					promises.push( promise );
				}
			}
		}
		return Promise.all( promises );
	}

	onDeleted() {
		this._api.deleteSubscription().catch( this.error )
		this._api.removeAllListeners();
	}

	_onMeasurements( measurements ) {
		this.log('_onMeasurements', measurements);
		this._syncMeasurements( measurements ).catch( this.error );
	}

	_onToken( token ) {
		this.log('Refreshed OAuth2 token');
		this.setStoreValue('token', token).catch( this.error );
	}

}

module.exports = NokiaHealthDevice;