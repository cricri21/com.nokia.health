'use strict';

const Homey = require('homey');

const NokiaHealthApi = require('./lib/NokiaHealthApi');

class NokiaHealthApp extends Homey.App {
	
	onInit() {
		
		this.log('NokiaHealthApp is running...');
		
		return;

		let nokiaHealthApi = new NokiaHealthApi();
		
		nokiaHealthApi.setToken({ access_token: '70d9a5974249d2d13a813735f4f558970ceccdba',
		  expires_in: '10800',
		  token_type: 'Bearer',
		  scope: false,
		  refresh_token: '886fa983e04c3908e4d73bc37eb205fbb00b2fbd',
		  userid: '14164014' })
		  
		nokiaHealthApi.createSubscription()
			.then( console.log )
			.catch( console.error );
		
		nokiaHealthApi.getUserInfo()
			.then( result => {
				console.log( JSON.stringify(result, false, 4) );
			})
			.then( console.error )
			  
		return;		
		
		let apiUrl = nokiaHealthApi.getOAuth2AuthorizationUrl();
		
		new Homey.CloudOAuth2Callback(apiUrl)
			.on('url', url => {
				console.log(url)
				//socket.emit('url', url);
			})
			.on('code', async code => {
				console.log(code)
				try {
					let token = await nokiaHealthApi.getOAuth2Token(code);
					nokiaHealthApi.setToken(token);
					console.log('token', token)
					//socket.emit('authorized');
				} catch( err ) {
					this.error( err );
					//socket.emit('error', err.message || err.toString());
				}
			})
			.generate()
			.catch( err => {
				this.error(err);
				//socket.emit('error', err);
			})
		
		
	}
	
}

module.exports = NokiaHealthApp;