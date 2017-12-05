'use strict';

const Homey = require('homey');
const NokiaHealthApi = require('../../lib/NokiaHealthApi');

class NokiaHealthDevice extends Homey.Device {
	
	onInit() {
		
		let data = this.getData();
		
		let store = this.getStore();
		this._api = new NokiaHealthApi();
		this._api.setToken( store.token );
		this._api.createSubscription( data.userId ).catch( err => {
			this.error(err);
			this.setUnavailable( err );
		})
		this._api.on('measurement', this._onMeasurement.bind(this));
			
	}
	
	onDeleted() {
		this._api.deleteSubscription().catch( err => {
			 this.error(err);
		})
	}
	
	_onMeasurement( measurement ) {
		this.log('_onMeasurement', measurement);
		
		let driver = this.getDriver();
		
		if( measurement.type === 'weight' )		
			driver.triggerFlowWeight( this, measurement.value ).catch( this.error );
	}
	
}

module.exports = NokiaHealthDevice;