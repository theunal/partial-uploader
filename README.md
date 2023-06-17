## Installation

```sh
npm install partial-uploader
```

## Usage

```js
    import { uploadWithPartialFile } from 'partial-uploader';

    let file = event.target.files[0];

    uploadWithPartialFile('/url', this.file, {
      // headers
    }).then((x: any) => {
      if (x.isSuccess)
        return x.id; // folder name
      else
        console.log(x.message);
    }).catch((err: any) => {
      if (err.isSuccess)
        return err.id; // folder name
      else
        console.log(err.message);
    });
```