'use strict';

const Homey = require('homey');
const NokiaHealthApi = require('../../lib/NokiaHealthApi');

class NokiaHealthDevice extends Homey.Device {
	
	onInit() {
		
		let data = this.getData();
		this._userId = data.userId;
		
		let store = this.getStore();
		this._api = new NokiaHealthApi();
		this._api.setToken( store.token );
		this._api.createSubscription( this._userId ).catch( err => {
			this.error(err);
			this.setUnavailable( err );
		})
		this._api.on('measurement', this._onMeasurement.bind(this));
		
		this.sync();
	}
	
	sync() {
		this._api.getMeasurement({
			userid: this._userId,
			meastype: 'weight',
			limit: 1
		}).then( result => {
			let measurement = NokiaHealthApi.parseMeasurementResult( result );
			return this.setCapabilityValue('nh_measure_weight', measurement.value)
		}).catch( this.error );
	}
	
	onDeleted() {
		this._api.deleteSubscription().catch( err => {
			 this.error(err);
		})
	}
	
	_onMeasurement( measurement ) {
		this.log('_onMeasurement', measurement);
		
		let driver = this.getDriver();
		
		if( measurement.type === 'weight' )	{
			this.setCapabilityValue('nh_measure_weight', measurement.value).catch( this.error );
			driver.triggerFlowWeight( this, measurement.value ).catch( this.error );
		}
	}
	
}

module.exports = NokiaHealthDevice;