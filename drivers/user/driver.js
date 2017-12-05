'use strict';

const Homey = require('homey');
const NokiaHealthApi = require('../../lib/NokiaHealthApi');

class NokiaHealthDriver extends Homey.Driver {
	
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
							name: 'Nokia Health User',
							data: {
								userId: result.user.id.toString()
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
	
}

module.exports = NokiaHealthDriver;