'use strict';

const Homey = require('homey');
const NokiaHealthApi = require('../../lib/NokiaHealthApi');

class NokiaHealthDriver extends Homey.Driver {
	
	onInit() {
		this._flowTriggerWeight = new Homey.FlowCardTriggerDevice('nh_measure_weight_changed')
            .register()
	}
	
	onPair( socket ) {

		let nokiaHealthApi = new NokiaHealthApi();

		let apiUrl = nokiaHealthApi.getOAuth2AuthorizationUrl();
		new Homey.CloudOAuth2Callback(apiUrl)
			.on('url', url => {
				socket.emit('url', url);
			})
			.on('code', async code => {
				try {
					let token = await nokiaHealthApi.getOAuth2Token(code);
					nokiaHealthApi.setToken(token);
					socket.emit('authorized');
				} catch( err ) {
					this.error( err );
					socket.emit('error', err.message || err.toString());
				}
			})
			.generate()
			.catch( err => {
				socket.emit('error', err);
			})

		socket.on('list_devices', ( data, callback ) => {
	
			return nokiaHealthApi.getUserInfo()
				.then( result => {	
					callback( null, [
						{
							name: 'Nokia Health user',
							data: {
								userId: result.user.id
							},
							store: {
								token: nokiaHealthApi.getToken()
							}
						}
					]);	
				})
				.catch( err => {
					this.error(err);
					socket.emit('error', err.message || err.toString());
				})
		});
		
	}
	
	triggerFlowWeight( device, value ) {
		return this._flowTriggerWeight.trigger( device, { weight: value } );
	}
	
}

module.exports = NokiaHealthDriver;