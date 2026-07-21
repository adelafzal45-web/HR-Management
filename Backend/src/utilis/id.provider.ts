import { Provider } from '@nestjs/common';

export const CustomIdProvider: Provider = {
  provide: 'CUSTOM_ID_PROVIDER',
  useFactory: () => {
    console.log("i am in provider for the id")
    return () => Math.floor(Math.random() * 1000000); 
  },
  
};
